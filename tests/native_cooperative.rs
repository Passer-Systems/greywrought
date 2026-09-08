use clause_package::{Term, canonical_term_bytes, decode_canonical_term_bytes};
use greywrought_clause::{cooperative::CooperativeSession, native::field};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    sync::mpsc,
    thread,
    time::Duration,
};

const SOURCE: &[u8] = include_bytes!("../src/world/cooperative-expedition.clause");

enum Input {
    Frame(u32, String, mpsc::Sender<Vec<u8>>),
    Disconnected(u32),
}

struct Client(TcpStream);
impl Client {
    fn connect(address: std::net::SocketAddr) -> Self {
        let mut stream = TcpStream::connect(address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(10)))
            .unwrap();
        let mut id = [0];
        stream.read_exact(&mut id).unwrap();
        Self(stream)
    }
    fn send(&mut self, message: &str) -> Term {
        writeln!(self.0, "{message}").unwrap();
        let mut length = [0; 4];
        self.0.read_exact(&mut length).unwrap();
        let length = u32::from_le_bytes(length) as usize;
        assert!(length <= 1024 * 1024);
        let mut bytes = vec![0; length];
        self.0.read_exact(&mut bytes).unwrap();
        decode_canonical_term_bytes(&bytes).unwrap()
    }
}

fn number(world: &Term, subject: &str, role: &str) -> f64 {
    f64::from_le_bytes(
        field(field(world, subject).unwrap(), role)
            .unwrap()
            .as_atom()
            .unwrap()
            .canonical_payload()
            .try_into()
            .unwrap(),
    )
}

fn position(world: &Term, subject: &str) -> [f64; 2] {
    let point = field(field(world, subject).unwrap(), "position").unwrap();
    ["x", "z"].map(|axis| {
        f64::from_le_bytes(
            field(point, axis)
                .unwrap()
                .as_atom()
                .unwrap()
                .canonical_payload()
                .try_into()
                .unwrap(),
        )
    })
}

#[test]
fn two_real_clients_require_a_branch_at_the_current_admitted_parent() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let address = listener.local_addr().unwrap();
    let (notice, notices) = mpsc::channel();
    let server = thread::spawn(move || {
        let mut session = CooperativeSession::open(SOURCE).unwrap();
        // Establish that the advertised fork works at initial state first.
        session.disconnect_branch(1).unwrap();
        let (sender, events) = mpsc::channel();
        let mut readers = Vec::new();
        for connection in 1..=2 {
            let (mut stream, _) = listener.accept().unwrap();
            stream.write_all(&[connection as u8]).unwrap();
            let sender = sender.clone();
            readers.push(thread::spawn(move || {
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap() == 0 {
                        break;
                    }
                    assert!(line.len() <= 1024);
                    let (reply, response) = mpsc::channel();
                    sender.send(Input::Frame(connection, line, reply)).unwrap();
                    let bytes = response.recv().unwrap();
                    stream
                        .write_all(&(bytes.len() as u32).to_le_bytes())
                        .unwrap();
                    stream.write_all(&bytes).unwrap();
                }
                sender.send(Input::Disconnected(connection)).unwrap();
            }));
        }
        let mut disconnected = 0;
        while disconnected < 2 {
            match events.recv_timeout(Duration::from_secs(15)).unwrap() {
                Input::Frame(connection, line, reply) => {
                    let projection = if line.trim() == "observe" {
                        session.projection().unwrap()
                    } else {
                        let fields: Vec<_> = line.split_whitespace().collect();
                        assert_eq!(fields.len(), 5);
                        session
                            .command(
                                connection,
                                fields[1],
                                fields[0].parse().unwrap(),
                                fields[2],
                                fields[3].parse().unwrap(),
                                fields[4].parse().unwrap(),
                            )
                            .unwrap()
                    };
                    reply
                        .send(canonical_term_bytes(&projection).unwrap())
                        .unwrap();
                }
                Input::Disconnected(connection) => {
                    let outcome = session
                        .disconnect_branch(connection)
                        .err()
                        .map(|error| error.to_string());
                    notice.send((connection, outcome)).unwrap();
                    disconnected += 1;
                }
            }
        }
        for reader in readers {
            reader.join().unwrap();
        }
    });
    let mut first = Client::connect(address);
    let mut second = Client::connect(address);
    let moved = first.send("1 first move 0 1");
    assert_eq!(position(&moved, "first"), [0.0, 1.0]);
    assert_eq!(position(&moved, "second"), [0.0, 0.0]);
    assert_eq!(
        canonical_term_bytes(&moved).unwrap(),
        canonical_term_bytes(&second.send("observe")).unwrap()
    );
    let refused = first.send("2 second move 1 0");
    assert_eq!(position(&refused, "second"), [0.0, 0.0]);
    assert_eq!(number(&refused, "first", "last-sequence"), 1.0);
    first.send("2 first gather 0 0");
    let duplicate = first.send("2 first gather 0 0");
    assert_eq!(number(&duplicate, "first", "cargo"), 3.0);
    assert_eq!(number(&duplicate, "forest", "resource-remaining"), 9.0);
    second.send("1 second move 1 0");
    second.send("2 second move 1 1");
    let shared = second.send("3 second strike 0 0");
    assert_eq!(number(&shared, "forest", "enemy-health"), 9.0);
    assert_eq!(
        canonical_term_bytes(&shared).unwrap(),
        canonical_term_bytes(&first.send("observe")).unwrap()
    );
    drop(first);
    let (connection, failure) = notices.recv_timeout(Duration::from_secs(10)).unwrap();
    assert_eq!(connection, 1);
    eprintln!("real client 1 disconnect after admitted movement/gathering: {failure:?}");
    let continued = second.send("4 second gather 0 0");
    assert_eq!(number(&continued, "second", "cargo"), 3.0);
    assert_eq!(number(&continued, "first", "cargo"), 3.0);
    assert_eq!(number(&continued, "forest", "resource-remaining"), 6.0);
    assert_eq!(position(&continued, "first"), [0.0, 1.0]);
    eprintln!(
        "two TCP clients shared accepted enemy/resource state; peer continued; no rejoin success is claimed"
    );
    drop(second);
    notices.recv_timeout(Duration::from_secs(10)).unwrap();
    server.join().unwrap();
    assert!(
        failure.is_none(),
        "played-world disconnect must retain a current-parent branch: {failure:?}"
    );
}

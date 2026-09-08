use clause_package::{Term, canonical_term_bytes, decode_canonical_term_bytes};
use greywrought_clause::{
    cooperative::{AuthenticatedConnection, Command, ConnectionCustody, CooperativeSession},
    native::field,
};
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

enum SecureInput {
    Attach(
        [u8; 32],
        mpsc::Sender<Option<(AuthenticatedConnection, [u8; 32])>>,
    ),
    Frame(AuthenticatedConnection, String, mpsc::Sender<Vec<u8>>),
    Disconnected(AuthenticatedConnection),
}

fn authenticated_client(
    address: std::net::SocketAddr,
    credential: &[u8; 32],
) -> Option<(Client, [u8; 32])> {
    let mut stream = TcpStream::connect(address).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .unwrap();
    stream.write_all(credential).unwrap();
    let mut accepted = [0];
    stream.read_exact(&mut accepted).unwrap();
    if accepted == [0] {
        return None;
    }
    let mut rotated = [0; 32];
    stream.read_exact(&mut rotated).unwrap();
    Some((Client(stream), rotated))
}

fn command(line: &str) -> Command {
    let fields: Vec<_> = line.split_whitespace().collect();
    assert_eq!(fields.len(), 5);
    Command {
        sequence: fields[0].parse().unwrap(),
        claimed_player: fields[1].to_owned(),
        operation: fields[2].to_owned(),
        x: fields[3].parse().unwrap(),
        z: fields[4].parse().unwrap(),
    }
}

#[test]
fn authenticated_rejoin_rechecks_pending_work_after_peer_exhausts_resources() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let address = listener.local_addr().unwrap();
    let mut custody = ConnectionCustody::default();
    let first_credential = custody.provision(1).unwrap();
    let second_credential = custody.provision(2).unwrap();
    let (notice, notices) = mpsc::channel();
    let server = thread::spawn(move || {
        let mut session = CooperativeSession::open(SOURCE).unwrap();
        let (sender, events) = mpsc::channel();
        let acceptor = thread::spawn(move || {
            let mut readers = Vec::new();
            for _ in 0..4 {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(15)))
                    .unwrap();
                let sender = sender.clone();
                readers.push(thread::spawn(move || {
                    let mut credential = [0; 32];
                    stream.read_exact(&mut credential).unwrap();
                    let (reply, response) = mpsc::channel();
                    sender.send(SecureInput::Attach(credential, reply)).unwrap();
                    let Some((attachment, rotated)) = response.recv().unwrap() else {
                        stream.write_all(&[0]).unwrap();
                        return;
                    };
                    stream.write_all(&[1]).unwrap();
                    stream.write_all(&rotated).unwrap();
                    let mut reader = BufReader::new(stream.try_clone().unwrap());
                    loop {
                        let mut line = String::new();
                        if reader.by_ref().take(1025).read_line(&mut line).unwrap() == 0 {
                            break;
                        }
                        assert!(line.len() <= 1024 && line.ends_with('\n'));
                        let (reply, response) = mpsc::channel();
                        sender
                            .send(SecureInput::Frame(attachment, line, reply))
                            .unwrap();
                        let bytes = response.recv().unwrap();
                        stream
                            .write_all(&(bytes.len() as u32).to_le_bytes())
                            .unwrap();
                        stream.write_all(&bytes).unwrap();
                    }
                    sender.send(SecureInput::Disconnected(attachment)).unwrap();
                }));
            }
            for reader in readers {
                reader.join().unwrap();
            }
        });
        let mut branches = std::collections::BTreeMap::new();
        let mut disconnected = 0;
        let mut adjudications = 0;
        while disconnected < 3 {
            match events.recv_timeout(Duration::from_secs(20)).unwrap() {
                SecureInput::Attach(credential, reply) => {
                    reply.send(custody.attach(&credential).ok()).unwrap();
                }
                SecureInput::Frame(attachment, line, reply) => {
                    let identity = custody.identity(attachment).unwrap();
                    let projection = if line.trim() == "observe" {
                        session.projection().unwrap()
                    } else if let Some(pending) = line.trim().strip_prefix("resume;") {
                        let pending: Vec<_> = pending.split(';').map(command).collect();
                        let branch = branches.get_mut(&identity).unwrap();
                        let admission = session.reconnect(branch, &pending).unwrap();
                        let explanation = &admission.explanation;
                        assert_ne!(
                            explanation.pins.parent_state,
                            explanation.authoritative_base
                        );
                        assert_ne!(explanation.ancestry.run, explanation.authoritative_run);
                        assert_ne!(
                            explanation.branch_candidate,
                            explanation.authoritative_candidate
                        );
                        assert_eq!(admission.state.predecessor, explanation.authoritative_base);
                        assert_eq!(explanation.branch_command_evidence.len(), 3);
                        for (branch, authoritative) in explanation
                            .branch_command_evidence
                            .iter()
                            .zip(&explanation.authoritative_command_evidence)
                        {
                            assert_eq!(branch.occurrence, authoritative.occurrence);
                            assert_ne!(branch.step, authoritative.step);
                            assert_ne!(branch.observation, authoritative.observation);
                        }
                        let admitted =
                            canonical_term_bytes(&session.projection().unwrap()).unwrap();
                        assert!(
                            session.reconnect(branch, &pending).is_err(),
                            "a retained proposal cannot be admitted twice"
                        );
                        assert_eq!(
                            admitted,
                            canonical_term_bytes(&session.projection().unwrap()).unwrap()
                        );
                        adjudications += 1;
                        session.projection().unwrap()
                    } else {
                        let command = command(&line);
                        session
                            .command(
                                identity,
                                &command.claimed_player,
                                command.sequence,
                                &command.operation,
                                command.x,
                                command.z,
                            )
                            .unwrap()
                    };
                    reply
                        .send(canonical_term_bytes(&projection).unwrap())
                        .unwrap();
                }
                SecureInput::Disconnected(attachment) => {
                    let identity = custody.detach(attachment).unwrap();
                    assert!(custody.identity(attachment).is_err());
                    branches.insert(identity, session.disconnect(identity).unwrap());
                    disconnected += 1;
                    notice.send(identity).unwrap();
                }
            }
        }
        acceptor.join().unwrap();
        assert_eq!(adjudications, 1);
    });

    let (mut first, first_resume) = authenticated_client(address, &first_credential).unwrap();
    let (mut second, _) = authenticated_client(address, &second_credential).unwrap();
    first.send("1 first move 0 1");
    first.send("2 first gather 0 0");
    second.send("1 second move 1 0");
    second.send("2 second move 1 1");
    second.send("3 second gather 0 0");
    drop(first);
    assert_eq!(notices.recv_timeout(Duration::from_secs(10)).unwrap(), 1);
    second.send("4 second gather 0 0");
    let exhausted = second.send("5 second gather 0 0");
    assert_eq!(number(&exhausted, "forest", "resource-remaining"), 0.0);
    assert_eq!(number(&exhausted, "second", "cargo"), 9.0);
    assert_eq!(number(&exhausted, "first", "cargo"), 3.0);
    assert!(
        authenticated_client(address, &first_credential).is_none(),
        "consumed credential must not reconnect"
    );
    let (mut rejoined, _) = authenticated_client(address, &first_resume).unwrap();
    let refused = rejoined.send("3 first move 0 0");
    assert_eq!(
        position(&refused, "first"),
        [0.0, 1.0],
        "socket authentication alone does not reconnect the source player"
    );
    assert_eq!(number(&refused, "first", "last-sequence"), 2.0);
    let reconciled = rejoined.send("resume;3 first gather 0 0;3 first gather 0 0");
    assert_eq!(number(&reconciled, "forest", "resource-remaining"), 0.0);
    assert_eq!(number(&reconciled, "first", "cargo"), 3.0);
    assert_eq!(number(&reconciled, "first", "last-sequence"), 2.0);
    assert_eq!(number(&reconciled, "second", "cargo"), 9.0);
    let impersonation = rejoined.send("6 second extract 0 0");
    assert_eq!(number(&impersonation, "second", "last-sequence"), 5.0);
    rejoined.send("3 first move 0 0");
    rejoined.send("4 first extract 0 0");
    let duplicate = rejoined.send("4 first extract 0 0");
    assert_eq!(number(&duplicate, "first", "stock"), 3.0);
    assert_eq!(number(&duplicate, "first", "cargo"), 0.0);
    assert_eq!(
        canonical_term_bytes(&duplicate).unwrap(),
        canonical_term_bytes(&second.send("observe")).unwrap()
    );
    drop(rejoined);
    assert_eq!(notices.recv_timeout(Duration::from_secs(10)).unwrap(), 1);
    drop(second);
    assert_eq!(notices.recv_timeout(Duration::from_secs(10)).unwrap(), 2);
    server.join().unwrap();
    eprintln!(
        "two real clients: rotated credential rejoin, disconnected input refusal, current-world adjudication, exhausted resource protection and exactly-once extraction passed"
    );
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

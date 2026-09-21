/** Individually drawn control surfaces for the Relic Warden. Y up, front +Z.
 * These are editable quad cages, not a collection of stock construction solids.
 * Blender resolves subdivision, wall thickness and the final surface normals.
 */
import { Vector3 } from "three";

export type Point = [number, number, number];
export interface Panel {
  name: string; bone: string; material: string; vertices: Point[]; faces: number[][];
  subdivision: number; thickness: number; category: string;
}
export const panels: Panel[] = [];
const pi = Math.PI;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const bell = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
const v = (p: Point) => new Vector3(...p);
const xyz = (p: Vector3): Point => [p.x, p.y, p.z];

function mesh(name: string, bone: string, material: string, vertices: Point[], faces: number[][], subdivision = 2, thickness = .028, category = "Armor") {
  const panel = { name, bone, material, vertices, faces, subdivision, thickness, category };
  panels.push(panel); return panel;
}
function grid(name: string, bone: string, material: string, nu: number, nv: number, point: (u: number, t: number) => Point, thickness = .028, subdivision = 2, category = "Armor") {
  const verts: Point[] = [], faces: number[][] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) verts.push(point(i / nu, j / nv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i; faces.push([a, a + 1, a + nu + 2, a + nu + 1]);
  }
  return mesh(name, bone, material, verts, faces, subdivision, thickness, category);
}
/** Closed section loft. Every row controls width, depth, sweep and offset. */
function loft(name: string, bone: string, material: string, rows: number[][], segments = 24, shape?: (angle: number, t: number, p: Point) => Point, category = "Armor") {
  const verts: Point[] = [], faces: number[][] = [];
  rows.forEach(([y = 0, width = 0, front = 0, back = 0, cx = 0, cz = 0], j) => {
    for (let i = 0; i < segments; i++) {
      const a = i * 2 * pi / segments, c = Math.cos(a);
      const p: Point = [cx + width * Math.sin(a), y, cz + (c > 0 ? front : back) * c];
      verts.push(shape ? shape(a, j / (rows.length - 1), p) : p);
    }
  });
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * segments + i, b = j * segments + (i + 1) % segments;
    faces.push([a, b, b + segments, a + segments]);
  }
  return mesh(name, bone, material, verts, faces, 2, .035, category);
}
function path(name: string, bone: string, material: string, points: Point[], radii: number[], segments = 8, category = "Fastenings") {
  const verts: Point[] = [], faces: number[][] = [];
  for (let j = 0; j < points.length; j++) {
    const p = v(points[j]!), prev = v(points[Math.max(0, j - 1)]!), next = v(points[Math.min(points.length - 1, j + 1)]!);
    const tangent = next.sub(prev).normalize();
    const a = new Vector3(0, 0, 1).cross(tangent).normalize();
    if (a.lengthSq() < .01) a.set(1, 0, 0);
    const b = tangent.clone().cross(a).normalize();
    for (let i = 0; i < segments; i++) {
      const t = 2 * pi * i / segments, r = radii[Math.min(j, radii.length - 1)]!;
      verts.push(xyz(p.clone().addScaledVector(a, Math.cos(t) * r).addScaledVector(b, Math.sin(t) * r)));
    }
    if (j) for (let i = 0; i < segments; i++) {
      const a0 = (j - 1) * segments + i, b0 = (j - 1) * segments + (i + 1) % segments;
      faces.push([a0, b0, b0 + segments, a0 + segments]);
    }
  }
  faces.push(Array.from({ length: segments }, (_, i) => segments - i - 1));
  faces.push(Array.from({ length: segments }, (_, i) => (points.length - 1) * segments + i));
  return mesh(name, bone, material, verts, faces, 1, 0, category);
}
function stud(name: string, bone: string, center: Point, radius = .036, material = "brass", normal: Point = [0, 0, 1]) {
  const p = v(center), n = v(normal).normalize();
  return path(name, bone, material, [-.025, 0, .012, .026, .031].map(d => xyz(p.clone().addScaledVector(n, d))), [radius * .72, radius, radius, radius * .66, radius * .22]);
}
/** An armor channel follows a limb, with an elliptical section, raised keel,
 * scooped borders, and a different section at each station. */
function limb(name: string, bone: string, material: string, start: Point, end: Point, rows: number[][], sweep = 2.4, sign = 1) {
  const origin = v(start), direction = v(end).sub(origin), axis = direction.clone().normalize();
  const right = new Vector3(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
  const front = right.clone().cross(axis).normalize();
  if (front.z < 0) front.negate();
  const verts: Point[] = [], faces: number[][] = [], n = 18;
  rows.forEach(([t = 0, width = 0, depth = 0, skew = 0], j) => {
    for (let i = 0; i <= n; i++) {
      const a = (i / n - .5) * sweep * 2;
      const flute = -.047 * (bell(Math.abs(a),.54,.16)+.65*bell(Math.abs(a),1.06,.15)) * Math.sin(pi * j / (rows.length - 1)) ** 2;
      const keel = .095 * bell(a, 0, .20) * Math.sin(pi * j / (rows.length - 1));
      const p = origin.clone().addScaledVector(direction, t + .025 * Math.cos(a * 2) * Math.sin(pi * j / (rows.length - 1)))
        .addScaledVector(right, Math.sin(a) * width + skew * sign)
        .addScaledVector(front, Math.cos(a) * (depth + flute) + keel);
      verts.push(xyz(p));
    }
  });
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i; faces.push([a, a + 1, a + n + 2, a + n + 1]);
  }
  return mesh(name, bone, material, verts, faces, 2, .035);
}

export function authorWarden(joints: Map<string, Point>) {
  panels.length = 0;
  const joint = (name: string) => joints.get(name)!;
  // The culet and waist meet the breastplate beneath articulated sliding lames.
  loft("Waist / continuous leather foundation", "Torso", "leather", [
    [2.32,.65,.39,.42,0,-.03],[2.35,.66,.4,.43,0,-.03], [2.52,.67,.43,.44,0,-.04],
    [2.82,.56,.42,.43,0,-.02],[3.05,.53,.46,.46,0,0],[3.09,.53,.46,.46,0,0],
  ], 24, (a,t,p) => [p[0],p[1] + .045 * Math.cos(a * 3) * Math.sin(pi*t), p[2] + .014*Math.cos(a*20)*Math.sin(pi*t)], "Foundation");
  // One connected armor envelope: projecting sternum, narrow waist, hollow armholes,
  // shoulder blade fullness and a back seam. No boxes/extrusions form the body.
  const torsoRows = [
    [2.77,.56,.52,.40,0,-.02], [2.81,.58,.53,.41,0,-.02], [2.98,.67,.60,.47,0,-.04],
    [3.22,.78,.66,.51,0,-.07], [3.52,.91,.65,.51,0,-.10], [3.77,.89,.57,.51,0,-.10],
    [3.95,.76,.46,.44,0,-.08], [4.03,.63,.38,.38,0,-.05], [4.065,.60,.37,.37,0,-.05],
  ];
  loft("Harness / shaped breast and back shell", "Chest", "iron", torsoRows, 64, (a,t,p) => {
    const c = Math.cos(a), front = Math.max(0,c);
    // Fluting emerges from the waist, fades toward the throat; keel belongs to skin.
    const flute = -.058 * (bell(Math.abs(Math.sin(a)),.16+.26*t,.10)+.62*bell(Math.abs(Math.sin(a)),.37+.22*t,.09)) * Math.sin(pi*t) ** 2 * front;
    const sternum = .10 * bell(Math.sin(a),0,.16) * front * Math.sin(pi*t);
    const coreSeat = -.085 * bell(p[0],0,.23) * bell(p[1],3.65,.21) * front;
    const dent = -.065 * bell(p[0],-.55,.17) * bell(p[1],3.52,.20) * front;
    return [p[0],p[1] + .07 * Math.cos(a*2) * Math.sin(pi*t),p[2] + flute+sternum+coreSeat+dent];
  });
  // Beaten lower rim sits flush against the body and returns into it at either end.
  for (let side = -1; side <= 1; side += 2) {
    path("Harness / rolled waist rim", "Chest", "edge", Array.from({length:17},(_,i) => {
      const a = side * i/16*pi; return [.574*Math.sin(a),2.81,.535*Math.cos(a)-.02] as Point;
    }), [.026]);
  }
  // Four sliding lames cover the abdomen without pretending to be solid ribs.
  for(let layer=0;layer<3;layer++) {
    const y=2.82-layer*.17;
    grid(`Fauld / overlapping lame ${layer+1}`,"Torso","iron",24,5,(u,t)=>{
      const a=(u-.5)*2*pi, r=.59+layer*.045+.05*t;
      return [r*Math.sin(a),y-.23*t-.11*Math.max(0,Math.cos(a)),(.45+.045*layer+.025*t)*Math.cos(a)-.015];
    },.026,2);
    for(const side of [-1,1]) stud("Fauld / sliding rivet","Torso",[side*(.48+layer*.038),y-.13,.29],.032,"brass");
  }
  // The neck is received by a low, flared collar, not perched on top of a cylinder.
  loft("Gorget / flared throat socket","Chest","iron",[
    [3.96,.54,.39,.38,.02,-.07],[3.99,.56,.4,.39,.02,-.07], [4.09,.52,.38,.36,.03,-.06],
    [4.20,.40,.29,.29,.05,-.08],[4.27,.36,.28,.27,.05,-.08],[4.29,.36,.28,.27,.05,-.08],
  ],32,(a,t,p)=>[p[0],p[1]-.045*Math.cos(a)*Math.sin(t*pi),p[2]]);
  loft("Neck / protected bellows","Neck","recess",[
    [4.12,.25,.22,.22,.06,-.12],[4.16,.28,.25,.25,.06,-.12], [4.22,.25,.22,.22,.06,-.12],
    [4.28,.28,.25,.25,.06,-.12],[4.34,.25,.22,.22,.06,-.12],[4.40,.28,.25,.25,.06,-.12],
    [4.46,.25,.22,.22,.06,-.12], [4.50,.24,.21,.21,.06,-.12],
  ],24,undefined,"Mechanism");
  // Helmet: bowl crown, drawn-in temples, long nape, and cheek/brow surfaces
  // separated by an actual opening. Crown is closed with progressively tiny rows.
  loft("Helm / swept crown and nape","Head","iron",[
    [4.45,.29,.26,.29,.065,-.06],[4.48,.32,.27,.33,.065,-.07], [4.66,.39,.31,.36,.065,-.08],
    [4.86,.40,.33,.37,.065,-.08],[5.05,.34,.29,.32,.065,-.085],
    [5.20,.22,.20,.23,.065,-.09],[5.28,.09,.09,.10,.065,-.09],[5.295,.012,.012,.012,.065,-.09],
  ],32,(a,t,p)=> {
    const c=Math.cos(a), dent=.05*bell(p[0],-.17,.15)*bell(p[1],4.98,.11)*Math.max(0,c);
    return [p[0],p[1] - (1-t)**2*.20*Math.max(0,-c),p[2]-.10*Math.max(0,c)*(1-t)-dent];
  });
  grid("Visor / brow over recessed sight","Head","edge",24,5,(u,t)=>{
    const a=(u-.5)*2.7, x=.41*Math.sin(a)+.065;
    return [x,4.90+.08*t-.025*Math.abs(Math.sin(a)),.31*Math.cos(a)+.06+.025*Math.sin(t*pi)];
  },.03);
  grid("Visor / drawn beak and cheek plate","Head","iron",24,10,(u,t)=>{
    const a=(u-.5)*2.8, width=mix(.36,.405,t), nose=.19*bell(a,0,.35)*Math.sin(pi*t*.82)-.033*bell(Math.abs(a),.61,.17)*Math.sin(t*pi);
    return [.065+width*Math.sin(a),4.43+.375*t-.09*Math.cos(a)*(1-t),.26*Math.cos(a)+.065+nose];
  },.033);
  grid("Sight / deep black opening","Head","recess",24,2,(u,t)=>{
    const a=(u-.5)*2.4;return [.065+.37*Math.sin(a),4.805+.089*t,.30*Math.cos(a)+.065];
  },.016,1,"Mechanism");
  for(const side of [-1,1]) {
    grid("Sight / dim buried lens","Head","light",10,2,(u,t)=>{
      const x=side*mix(.07,.27,u);return [.065+x,4.847+t*.014,.377-x*x*.95];
    },.008,1,"Mechanism");
    stud("Helm / visor pivot","Head",[.065+side*.389,4.81,.052],.062,"brass",[side,0,.2]);
    for(let i=0;i<3;i++) {
      path("Visor / recessed breath slit","Head","recess", [[.065+side*(.12+i*.065),4.54,.343-i*.038],[.065+side*(.14+i*.065),4.65,.363-i*.037]], [.009],6);
    }
  }
  path("Helm / forged median ridge","Head","edge",[[.065,4.96,.365],[.065,5.10,.23],[.065,5.27,.055],[.065,5.30,-.09],[.065,5.22,-.28],[.065,4.98,-.45],[.065,4.68,-.455]], [.016,.023,.024,.022,.019,.017,.012]);
  // Recessed power reliquary: small lancet-shaped bezel integrated into the chest.
  const lancet=(u:number,t:number):Point=>{
    const a=u*2*pi, w=.145*(.72+.28*Math.sin(a)), h=.265;
    return [w*Math.cos(a)*(1-t*.28),3.58+h*Math.sin(a)*(1-t*.23),.515+t*.020+.017*Math.sin(a)];
  };
  grid("Core / recessed lancet bezel","Chest","brass",32,4,lancet,.022,2,"Core");
  grid("Core / ancient ceramic lens","Chest","ceramic",16,10,(u,t)=>{
    const a=(u-.5)*pi,b=(t-.5)*pi; return [.112*Math.sin(a)*Math.cos(b),3.58+.205*Math.sin(b),.50+.025*Math.cos(a)*Math.cos(b)];
  },.014,2,"Core");
  path("Core / narrow current seam","Chest","light",[[0,3.41,.516],[0,3.47,.526],[0,3.60,.532],[0,3.75,.512]],[.013,.015,.014,.006],8,"Core");
  for(const side of [-1,1]) for(let i=0;i<2;i++) stud("Core / sealed custody bolt","Chest",[side*.177,3.48+i*.18,.525],.028);
  function breastZ(x:number,y:number){
    const i=torsoRows.findIndex(r=>r[0]!>=y),a=torsoRows[Math.max(0,i-1)]!,b=torsoRows[Math.max(0,i)]!;
    const t=(y-a[0]!)/(b[0]!-a[0]!||1),w=mix(a[1]!,b[1]!,t),d=mix(a[2]!,b[2]!,t),cz=mix(a[5]!,b[5]!,t);
    return cz+d*Math.sqrt(Math.max(.01,1-(x/w)**2));
  }
  // A constrained repair interrupts one breastplate flute. Its surface conforms
  // to the breastplate instead of standing in front of it as a floating plaque.
  grid("Harness / hammered repair bridge","Chest","repair",8,8,(u,t)=>{
    const x=-.69+.29*u,y=3.35+.41*t;
    return [x,y,breastZ(x,y)+.022+.012*Math.sin(u*9+t*4)];
  },.025,2,"Repairs");
  for(const [x,y] of [[-.66,3.41],[-.45,3.41],[-.65,3.69],[-.43,3.69]] as [number,number][]) stud("Repair / mismatched clenched rivet","Chest",[x,y,breastZ(x,y)+.035],.033,"edge");
  // The back has its own construction: dished shoulder blades, a service hatch
  // seated into the spine, hinges and a deliberately reachable disconnect.
  grid("Back / fitted maintenance leaf","Chest","repair",12,12,(u,t)=>{
    const x=(u-.5)*.66;return [x,3.13+t*.72,-.57-.025*Math.sin(t*pi)+.06*(2*u-1)**2];
  },.031);
  for(const side of [-1,1]) for(let i=0;i<3;i++) stud("Back / hatch fastener","Chest",[side*.285,3.22+i*.22,-.575],.03,"brass",[0,0,-1]);
  for(let i=0;i<4;i++) path("Back / hooded cooling seam","Chest","recess",[[-.21,3.38+i*.07,-.604],[0,3.39+i*.07,-.616],[.21,3.38+i*.07,-.604]],[.009],6);
  path("Back / captive manual disconnect","Chest","brass",[[.27,3.2,-.60],[.30,3.17,-.69],[.20,3.04,-.72],[.1,3.04,-.71],[.075,3.10,-.67],[.16,3.18,-.65]],[.025]);

  for(const side of [-1,1]) {
    const suffix=side===1?"L":"R", upper=joint("UpperArm"+suffix), elbow=joint("LowerArm"+suffix), palm=joint("PalmP"+suffix);
    // A flattened, dished shoulder envelope. The inner edge receives the torso;
    // its outer skirt covers the pivot and overlaps the sliding underlames.
    loft(`Shoulder ${suffix} / dished pauldron`,"UpperArm"+suffix,side===1?"iron":"repair",[
      [-.19,.49,.43,.43,.10],[-.15,.53,.47,.46,.10],[.01,.57,.48,.47,.06],
      [.18,.51,.44,.43,.025],[.30,.37,.34,.33,-.03],[.35,.18,.18,.17,-.05],[.36,.012,.012,.012,-.05],
    ].map(([y=0,w=0,f=0,b=0,c=0])=>[upper[1]+y,w,f,b,upper[0]+side*c,upper[2]]),32,(a,t,p)=>{
      const dent=side===-1?.065*bell(Math.sin(a),-.65,.3)*bell(t,.5,.25):0;
      return [p[0],p[1]-.06*Math.cos(a*2)*(1-t)-dent,p[2]+.020*Math.cos(a*8)*Math.sin(t*pi)];
    });
    path(`Shoulder ${suffix} / returned lower rim`,"UpperArm"+suffix,"edge",Array.from({length:33},(_,i)=>{
      const a=i/32*2*pi;return [upper[0]+side*.1+.50*Math.sin(a),upper[1]-.18-.06*Math.cos(a*2),upper[2]+.442*Math.cos(a)] as Point;
    }),[.018],8);
    for(const a of [-.62,.62]) stud(`Shoulder ${suffix} / sliding suspension rivet`,"UpperArm"+suffix,[upper[0]+side*.10+.51*Math.sin(a),upper[1]-.075,upper[2]+.468*Math.cos(a)],.034,"brass",[Math.sin(a),.1,Math.cos(a)]);
    limb(`Shoulder ${suffix} / covered pivot`,"UpperArm"+suffix,"recess",upper,elbow,[[-.13,.005,.005],[-.09,.23,.23],[.0,.28,.28],[.16,.26,.26],[.22,.18,.18]],pi,side);
    for(let layer=0;layer<2;layer++) {
      grid(`Shoulder ${suffix} / sliding underlame ${layer}`,"UpperArm"+suffix,"iron",20,4,(u,t)=>{
        const a=(u-.5)*pi*1.32, r=.54-layer*.035;
        return [upper[0]+side*(r*Math.cos(a)-.05+.055*t),upper[1]-.07-layer*.16-.21*t,upper[2]+r*.95*Math.sin(a)];
      },.026);
    }
    limb(`Upper arm ${suffix} / fluted rerebrace`,"UpperArm"+suffix,"iron",upper,elbow,[[.16,.29,.29],[.19,.30,.30],[.32,.33,.30],[.58,.28,.27],[.77,.225,.23],[.82,.22,.23]],2.60,side);
    limb(`Arm ${suffix} / internal load bearing link`,"UpperArm"+suffix,"recess",upper,elbow,[[.2,.17,.17],[.30,.19,.19],[.73,.17,.17],[.97,.19,.19],[1.05,.01,.01]],pi,side);
    limb(`Elbow ${suffix} / recessed flexible gaiter`,"LowerArm"+suffix,"recess",elbow,palm,[[0,.225,.22],[.03,.26,.26],[.08,.23,.23],[.12,.26,.26],[.16,.23,.23]],pi,side);
    limb(`Elbow ${suffix} / pointed couter`,"LowerArm"+suffix,"iron",elbow,palm,[[-.12,.20,.23],[-.08,.30,.34],[.04,.36,.38],[.17,.29,.35],[.28,.14,.24],[.30,.10,.22]],2.0,side);
    limb(`Elbow ${suffix} / sealed rotary joint`,"LowerArm"+suffix,"recess",elbow,palm,[[-.20,.008,.008],[-.15,.21,.21],[-.04,.26,.26],[.09,.25,.25],[.25,.18,.18],[.31,.008,.008]],pi,side);
    limb(`Forearm ${suffix} / drawn vambrace`,"LowerArm"+suffix,"iron",elbow,palm,[[.22,.27,.29],[.25,.29,.31],[.38,.31,.30],[.63,.255,.245],[.82,.20,.19],[.86,.21,.20],[.9,.215,.205]],2.8,side);
    limb(`Forearm ${suffix} / enclosed actuator`,"LowerArm"+suffix,"recess",elbow,palm,[[.12,.01,.01],[.22,.21,.21],[.44,.225,.225],[.78,.17,.17],[.98,.16,.16],[1.01,.01,.01]],pi,side);
    limb(`Wrist ${suffix} / leather cuff`,"PalmP"+suffix,"leather",elbow,palm,[[.83,.185,.18],[.87,.20,.20],[.94,.205,.20],[.98,.18,.19]],pi,side);
    // Palm armor and separately articulated finger shells use the pack's hand joints.
    const fingers={T:"Thumb",I:"Index",R:"Ring",P:"Pinky"};
    for(const [f,label] of Object.entries(fingers)) {
      const name="Palm"+f+suffix, p=joint(name);
      if(!p) continue;
      const end=joint(label+'1'+suffix),tip=joint(label+'2'+suffix);
      limb(`Hand ${suffix} / metacarpal ${f}`,name,"iron",p,end,[[-.06,.095,.095],[0,.12,.12],[.45,.115,.12],[.90,.105,.11],[1.02,.09,.095]],2.7,side);
      limb(`Hand ${suffix} / finger ${f} first joint`,label+'1'+suffix,"iron",end,tip,[[-.04,.01,.01],[.02,.105,.10],[.25,.11,.105],[.7,.09,.09],[.98,.085,.085],[1.03,.01,.01]],pi,side);
      const last=xyz(v(tip).addScaledVector(v(tip).sub(v(end)),.55));
      limb(`Hand ${suffix} / finger ${f} curled tip`,label+'2'+suffix,"iron",tip,last,[[-.04,.01,.01],[.03,.089,.089],[.5,.084,.08],[.87,.065,.065],[1,.008,.008]],pi,side);
    }
    // Load-bearing lower anatomy: broad knee sockets, keeled shin and foot plates.
    const hip=joint("UpperLeg"+suffix), knee=joint("LowerLeg"+suffix), foot=joint("Foot"+suffix);
    limb(`Thigh ${suffix} / shaped cuisse`,"UpperLeg"+suffix,"iron",hip,knee,[[.05,.28,.28],[.09,.35,.35],[.25,.34,.36],[.49,.30,.31],[.69,.25,.27],[.74,.25,.27]],2.65,side);
    limb(`Leg ${suffix} / internal load bearing link`,"UpperLeg"+suffix,"recess",hip,knee,[[-.10,.01,.01],[0,.23,.23],[.24,.24,.24],[.62,.21,.21],[.88,.24,.24],[1.08,.01,.01]],pi,side);
    limb(`Knee ${suffix} / protected joint`,"LowerLeg"+suffix,"recess",knee,foot,[[-.16,.22,.23],[-.1,.27,.27],[0,.27,.27],[.11,.245,.24],[.15,.245,.24]],pi,side);
    limb(`Knee ${suffix} / winged poleyn`,"LowerLeg"+suffix,"iron",knee,foot,[[-.18,.10,.22],[-.13,.25,.31],[-.02,.36,.40],[.09,.30,.38],[.19,.18,.28],[.22,.08,.24]],2.0,side);
    limb(`Knee ${suffix} / sealed rotary joint`,"LowerLeg"+suffix,"recess",knee,foot,[[-.23,.01,.01],[-.17,.20,.22],[-.07,.26,.27],[.05,.26,.27],[.19,.20,.22],[.24,.01,.01]],pi,side);
    limb(`Shin ${suffix} / forged greave`,"LowerLeg"+suffix,"iron",knee,foot,[[.19,.235,.275],[.23,.25,.29],[.39,.30,.30],[.58,.27,.27],[.79,.205,.24],[.94,.26,.33],[.97,.26,.33]],2.75,side);
    limb(`Shin ${suffix} / protected actuator casing`,"LowerLeg"+suffix,"recess",knee,foot,[[.12,.01,.01],[.19,.19,.23],[.40,.24,.24],[.69,.18,.20],[.94,.16,.17],[1,.01,.01]],pi,side);
    // Ankle cuirass sweeps into a long sabaton instead of a box foot.
    const fx=foot[0];
    loft(`Foot ${suffix} / continuous sabaton`,"Foot"+suffix,"iron",[
      [.025,.29,.61,.30,fx,-.05],[.06,.33,.66,.33,fx,-.05],[.14,.34,.68,.34,fx,-.05],
      [.23,.31,.58,.31,fx,-.08],[.36,.245,.39,.24,fx,-.20], [.49,.20,.23,.21,fx,-.29], [.51,.20,.22,.20,fx,-.29],
    ],28,(a,t,p)=>[p[0],p[1]+.025*Math.sin(a*2)*Math.sin(pi*t),p[2]]);
    // Rear straps physically wrap behind each open greave.
    for(const k of [.36,.70]) limb(`Shin ${suffix} / rear retaining strap`,"LowerLeg"+suffix,"leather",knee,foot,[[k-.025,.265,.28],[k,.277,.29],[k+.04,.27,.285]],pi,side);
    for(const y of [.55,.94]) stud(`Shin ${suffix} / strap pin`,"LowerLeg"+suffix,[fx+side*.25,y,-.11],.037,"brass",[side,0,.3]);
  }
  // Heavy woven skirt falls from a belt. Folds originate at the waist, spread
  // and sag; the hem is worn locally instead of being a regular sawtooth.
  for(const side of [-1,1]) {
    grid(`Skirt / ${side===1?"left":"right"} split linen panel`,"Torso","cloth",20,22,(u,t)=>{
      const a=side*(.075+u*2.90), radius=.67+.20*t;
      const folds=(.035+.055*t)*Math.sin(u*pi*9+.50*t)+.023*Math.sin(u*pi*17-t)*t;
      const hem=.055*Math.sin(u*9)+.025*Math.sin(u*29)+.10*bell(u,.72,.055);
      return [(radius+folds)*Math.sin(a),2.53-1.02*t+hem*t**6,((.47+.17*t)+folds)*Math.cos(a)-.035];
    },.016,2,"Textiles");
    // Separate narrow tassets protect the cloth at the upper thighs.
    grid(`Tasset ${side} / hanging fluted leaf`,"UpperLeg"+(side===1?"L":"R"),"iron",12,12,(u,t)=>{
      const x=side*(.48+u*.46), y=2.53-.52*t;
      return [x,y-.06*Math.sin(pi*u),.40+.12*Math.sin(pi*u)-.02*t+.023*Math.cos(u*pi*6)*Math.sin(t*pi)];
    },.027);
  }
  // Sword is shaped as a forged cross section: edge, fuller, raised midrib, edge.
  const grip=joint("PalmPR"), sx=grip[0]-.045, sy=grip[1]-.27, sz=grip[2]+.27;
  const bladeRows=[[0,.16],[.045,.17],[.12,.17],[.3,.14],[1.20,.11],[1.48,.06],[1.64,.004]];
  const bladeVertices:Point[]=[], bladeFaces:number[][]=[];
  for(const [l=0,w=0] of bladeRows) {
    for(const [u,d] of [[-1,0],[-.8,.025],[-.24,.06],[0,.075],[.24,.06],[.8,.025],[1,0]] as [number,number][]) bladeVertices.push([sx+u*w,sy-.25-l,sz+d]);
  }
  for(let j=0;j<bladeRows.length-1;j++) for(let i=0;i<6;i++){const a=j*7+i;bladeFaces.push([a,a+1,a+8,a+7]);}
  mesh("Sword / forged fuller and distal taper","PalmPR","edge",bladeVertices,bladeFaces,1,.047,"Equipment");
  path("Sword / curved crossguard","PalmPR","iron",[[-.42,-.32,0],[-.38,-.29,0],[-.22,-.22,0],[0,-.20,0],[.22,-.22,0],[.38,-.29,0],[.42,-.32,0]].map(p=>[sx+p[0]!,sy+p[1]!,sz+p[2]!] as Point),[.04,.055,.06,.07,.06,.055,.04],10,"Equipment");
  path("Sword / compressed leather grip","PalmPR","leather",[[sx,sy-.17,sz],[sx,sy-.14,sz],[sx,sy+.22,sz],[sx,sy+.25,sz]],[.066,.075,.067,.06],10,"Equipment");
  path("Sword / peened pommel","PalmPR","brass",[[sx,sy+.23,sz],[sx,sy+.27,sz],[sx,sy+.32,sz],[sx,sy+.40,sz],[sx,sy+.43,sz]],[.05,.10,.13,.08,.025],10,"Equipment");
  // Small heater shield: continuous doubly curved skin, chipped rim, fitted rear
  // straps. It follows the forearm; no huge symbol masks the torso or the hands.
  const elbow=joint("LowerArmL"), palm=joint("PalmPL"), shieldX=mix(elbow[0],palm[0],.68), shieldY=mix(elbow[1],palm[1],.68);
  const shieldPoint=(u:number,t:number,offset=0):Point=>{
    const width=.53*(.10+.90*Math.sin((.1+.9*t)*pi*.5));
    const x=(u-.5)*2*width+.085*bell(u,0,.08)*bell(t,.43,.09), chip=.04*bell(u,.85,.12)*bell(t,.65,.08);
    return [shieldX+x,shieldY-.91+1.55*t+.045*Math.cos(u*pi*2)*t, .67+.21*(1-(2*u-1)**2)*Math.sin(pi*(.15+.65*t))+offset-chip];
  };
  grid("Shield / dished iron face","LowerArmL","iron",20,20,(u,t)=>shieldPoint(u,t),.052,2,"Equipment");
  for(const u of [0,1]) path("Shield / rolled perimeter","LowerArmL","edge",Array.from({length:21},(_,i)=>shieldPoint(u,i/20,.012)),[.025],8,"Equipment");
  path("Shield / upper rolled edge","LowerArmL","edge",Array.from({length:17},(_,i)=>shieldPoint(i/16,1,.012)),[.025],8,"Equipment");
  grid("Shield / worn enamel field","LowerArmL","enamel",12,12,(u,t)=>shieldPoint(.16+.68*u,.22+.61*t,.026),.009,2,"Equipment");
  // Restrained mark: three old tally cuts, made in the local repair tradition.
  for(let i=0;i<3;i++) path("Shield / hand cut custody tally","LowerArmL","ceramic",[shieldPoint(.40+i*.10,.50,.043),shieldPoint(.43+i*.10,.72,.043)],[.013],6,"Equipment");
  for(const t of [.42,.80]) {
    path("Shield / rear leather enarme","LowerArmL","leather",[[shieldX-.33,shieldY-.91+1.55*t,.69],[shieldX-.24,shieldY-.91+1.55*t,.25],[shieldX+.17,shieldY-.91+1.55*t,.22],[shieldX+.31,shieldY-.91+1.55*t,.68]],[.045],8,"Equipment");
    for(const u of [.18,.82]) stud("Shield / clenched strap stud","LowerArmL",shieldPoint(u,t,.025),.03);
  }
  return panels;
}

import {openBrowser,check} from './session.js';
const runtime=process.argv.includes('--runtime');
Bun.env.GREYWROUGHT_GAME_URL='http://127.0.0.1:4191/'+(runtime?'?runtime':'');
const server=Bun.spawn([process.execPath,'scripts/art/preview-warden.ts'],{
  env:{...process.env,GREYWROUGHT_ART_PORT:'4191'},stdout:Bun.file('build/warden-study/inspection-server.log'),stderr:Bun.file('build/warden-study/inspection-server-errors.log'),
});
for(let i=0;i<100;i++){try{if((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok)break;}catch{}await Bun.sleep(100);}
const b=await openBrowser('warden-study',{localOnly:true}).catch(async error=>{server.kill();await server.exited;throw error;});
try{
  await b.waitFor('document.body.dataset.study === "ready"',60_000);
  const report=await b.evaluate<{clips:string[];surfaces:number;skinnedCloth:number;poses:{clip:string;time:number;valid:boolean}[]}>(`(()=>{
    const s=wardenStudy,entry=s.entries[0],poses=[];
    for(const clip of entry.clips)for(const fraction of [0,.25,.5,.85]){
      s.pose(clip.name,clip.duration*fraction);
      let valid=true;
      entry.root.traverse(o=>{if(o.isMesh){
        if(!o.matrixWorld.elements.every(Number.isFinite))valid=false;
        const p=o.geometry.attributes.position;
        for(let i=0;i<p.count;i++)if(!Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)))valid=false;
      }});
      poses.push({clip:clip.name,time:clip.duration*fraction,valid});
    }
    return {clips:entry.clips.map(c=>c.name),surfaces:entry.saved.size,skinnedCloth:[...entry.saved.keys()].filter(o=>o.isSkinnedMesh).length,poses};
  })()`);
  check(report.clips.length===(runtime?5:18),'Required source or encounter clips must survive');
  check(report.skinnedCloth===2,'Both skirt panels must be weighted for movement');
  check(report.poses.every(p=>p.valid),'Animation must preserve finite surface transforms');
  await b.evaluate('wardenStudy.pose("Idle",.5)');
  await b.shot('material-three-quarter');
  await b.click('#clay');await b.click('#equipment');
  for(const view of ['front','side','back']){await b.click('[data-view="'+view+'"]');await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await b.shot('clay-'+view);}
  await b.click('#clay');await b.click('#equipment');await b.click('[data-view="three-quarter"]');
  for(const [clip,time]of [['Run',.2],['SwordSlash',.35],['HitRecieve_1',.15],['Death',1]] as const){await b.evaluate('wardenStudy.pose('+JSON.stringify(clip)+','+time+')');await b.shot(clip);}
  await b.evaluate('wardenStudy.pose("Idle",.5)');await b.click('#old');await b.shot('earlier-blockout');
  check(b.errors.length===0,'No browser exceptions');
  await Bun.write(b.output+'/result.json',JSON.stringify(report,null,2)+'\n');
  console.log('Warden inspection passed: '+report.clips.length+' clips, '+report.poses.length+' sampled poses, 2 weighted cloth panels. '+b.output);
}finally{await b.close();server.kill();await server.exited;}

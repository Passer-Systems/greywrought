import { check, type openBrowser } from "./session.js";

export async function checkMinimap(page: Awaited<ReturnType<typeof openBrowser>>, location: string): Promise<void> {
  await page.waitFor('document.getElementById("map-terrain").dataset.ready==="true"');
  const sample = await page.evaluate<{ colors: number; centered: boolean; square: boolean; span: number }>(`(() => {
    const canvas=document.getElementById('map-terrain'), context=canvas.getContext('2d'), pixels=context.getImageData(0,0,512,512).data, colors=new Set();
    for(let i=0;i<pixels.length;i+=64)colors.add((pixels[i]>>4)+','+(pixels[i+1]>>4)+','+(pixels[i+2]>>4));
    const arrow=document.getElementById('map-player');
    return {colors:colors.size,centered:arrow.style.left==='50%'&&arrow.style.top==='50%',square:getComputedStyle(document.getElementById('map-field')).borderRadius==='0px',span:Number(canvas.dataset.span)};
  })()`);
  check(sample.colors > 30, `${location}: minimap contains shaded scenery detail`);
  check(sample.centered && sample.square, `${location}: centered arrow and square map`);
  await page.shot(`minimap-${location}`);
  await page.click('#map-zoom-in');
  check(await page.evaluate<number>('Number(document.getElementById("map-terrain").dataset.span)') < sample.span, 'Map zoom changes visible ground span');
  await page.click('#map-zoom-out');
  check(await page.evaluate<number>('Number(document.getElementById("map-terrain").dataset.span)') === sample.span, 'Zoom out restores ground span');
}

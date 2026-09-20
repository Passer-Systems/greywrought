/** Launch the installed Blender through the verified software OpenGL path. */
export {};
const args=process.argv.slice(2);
const child=Bun.spawn(['blender',...(args.length?args:['3d/relic-warden-study/relic-warden.blend'])],{
  env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1',GALLIUM_DRIVER:'llvmpipe'},
  stdin:'inherit',stdout:'inherit',stderr:'inherit',
});
process.exit(await child.exited);

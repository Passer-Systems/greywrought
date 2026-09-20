/** Blender's native authoring adapter. Bun writes this to ignored build/ and
 * invokes the installed Blender; no additional game language or dependency.
 * The custom editable cages and all design coordinates live in TypeScript.
 */
export const blenderAuthoring = String.raw`
import bpy, json, math, os, sys, bmesh
from mathutils import Matrix, Vector, noise
from mathutils.kdtree import KDTree
root = os.getcwd()
folder = os.path.join(root, 'assets/external/relic-warden')
build = os.path.join(root, 'build/warden')
with open(os.path.join(build,'surfaces.json')) as f: data=json.load(f)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.materials): bpy.data.materials.remove(d)
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def matrix(values): return Matrix([values[i::4] for i in range(4)])
def point(values): return (values[0],-values[2],values[1])
def collection(name):
    c=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
collections={name:collection(name) for name in ['Armor','Foundation','Mechanism','Fastenings','Core','Repairs','Textiles','Equipment','Studio']}
materials={}
for name,m in data['materials'].items():
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    mat.diffuse_color=tuple(m['color'])+(1,)
    n=mat.node_tree.nodes; links=mat.node_tree.links
    bs=n.get('Principled BSDF'); bs.inputs['Base Color'].default_value=tuple(m['color'])+(1,)
    bs.inputs['Metallic'].default_value=m['metalness']; bs.inputs['Roughness'].default_value=m['roughness']
    if name not in ['light','floor']:
        paint=n.new('ShaderNodeVertexColor');paint.layer_name='Patina';paint.label='Editable edge wear and repair patina'
        links.new(paint.outputs['Color'],bs.inputs['Base Color'])
    if name=='light':
        bs.inputs['Emission Color'].default_value=(.07,.27,.32,1); bs.inputs['Emission Strength'].default_value=1.4
    # Fine relief is subordinate to the hand-shaped geometry. Two noise scales
    # distinguish broad forge variation from microscopic surface pitting.
    if name not in ['light','recess']:
        tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=95 if name!='cloth' else 170
        tex.inputs['Detail'].default_value=2
        bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.18 if name not in ['cloth','leather'] else .3
        bump.inputs['Distance'].default_value=.008 if name!='cloth' else .006
        links.new(tex.outputs['Fac'],bump.inputs['Height']); links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    materials[name]=mat
armdata=bpy.data.armatures.new('Quaternius Mike / retained joint hierarchy')
arm=bpy.data.objects.new('Relic Warden / Mike animation rig',armdata); bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm; arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for item in data['bones']:
    b=armdata.edit_bones.new(item['name']); b.length=.16; b.matrix=C@matrix(item['matrix'])
    if item['parent']: b.parent=armdata.edit_bones.get(item['parent'])
bpy.ops.object.mode_set(mode='OBJECT'); arm.show_in_front=True; arm.select_set(False)
for item in data['bones']:
    expected=C@matrix(item['matrix']);actual=arm.data.bones[item['name']].matrix_local
    error=max(abs(a-b) for ar,br in zip(actual,expected) for a,b in zip(ar,br))
    if error>.0001:raise RuntimeError('Bind mismatch: '+item['name']+' '+str(error))
arm['source']='Quaternius Animated Mech Pack / March 2021 / Mike / CC0'
arm['lore']='Medieval custodians maintain an ancient protector; local authority to disconnect'
objects=[]
for part in data['panels']:
    me=bpy.data.meshes.new(part['name']+' / editable quad cage')
    me.from_pydata([point(p) for p in part['vertices']],[],part['faces']); me.update()
    bm=bmesh.new();bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    obj=bpy.data.objects.new(part['name'],me)
    category='Equipment' if part['name'].startswith(('Shield /','Sword /')) else part['category']
    collections[category].objects.link(obj)
    obj.data.materials.append(materials[part['material']])
    # Paint follows the control surface's boundaries: polished contact rims,
    # oxidation immediately behind the rim, soot low on the feet. This remains
    # a named, editable attribute in Blender and travels with the exported mesh.
    counts={}
    for face in part['faces']:
        for i in range(len(face)):
            key=tuple(sorted((face[i],face[(i+1)%len(face)])));counts[key]=counts.get(key,0)+1
    boundary=[]
    for (a,b),count in counts.items():
        if count==1:
            pa=Vector(part['vertices'][a]);pb=Vector(part['vertices'][b])
            for t in [0,.25,.5,.75,1]:boundary.append(pa.lerp(pb,t))
    tree=KDTree(max(1,len(boundary)))
    if not boundary:boundary=[Vector((100,100,100))]
    for i,p in enumerate(boundary):tree.insert(p,i)
    tree.balance()
    colors=me.color_attributes.new(name='Patina',type='FLOAT_COLOR',domain='POINT')
    base=data['materials'][part['material']]['color'];metal=part['material'] in ['iron','repair','edge','brass']
    for i,p0 in enumerate(part['vertices']):
        p=Vector(p0);n=noise.noise_vector(p*6.5)[0]*.5+.5
        dist=tree.find(p)[2]
        variation=.88+.16*n
        col=[c*variation for c in base]
        if metal:
            rust=max(0,1-abs(dist-.047)/.055)*max(0,(n-.34)/.66)*.72
            col=[c*(1-rust)+r*rust for c,r in zip(col,[.145,.061,.026])]
            polish=max(0,1-dist/.019)*(.4+.4*n)
            col=[c*(1-polish)+r*polish for c,r in zip(col,[.31,.30,.26])]
            if p.z<.20 and p.y<.45:col=[c*.65 for c in col]
        elif part['material']=='cloth':
            fade=max(0,1-abs(p.y-1.55)/.20)*.3
            col=[c*(1-fade)+r*fade for c,r in zip(col,[.16,.13,.08])]
        colors.data[i].color=tuple(col)+(1,)
    for p in me.polygons:p.use_smooth=True
    if part['subdivision']:
        sub=obj.modifiers.new('Resolved drawn surface','SUBSURF');sub.levels=part['subdivision'];sub.render_levels=part['subdivision']
    if part['thickness']:
        sol=obj.modifiers.new('Forged wall and returned edge','SOLIDIFY'); sol.thickness=part['thickness'];sol.offset=0;sol.use_even_offset=True
        bevel=obj.modifiers.new('Small edge catchlight','BEVEL');bevel.width=min(.01,part['thickness']*.18);bevel.segments=2
    group=obj.vertex_groups.new(name=part['bone']);group.add(list(range(len(me.vertices))),1,'REPLACE')
    if part['name'].startswith('Skirt /'):
        leg=obj.vertex_groups.new(name='UpperLegL' if 'left' in part['name'] else 'UpperLegR')
        for i,p in enumerate(part['vertices']):
            w=min(1,max(0,(2.45-p[1])/.90))**2*.68
            group.add([i],1-w,'REPLACE');leg.add([i],w,'REPLACE')
    obj['attachment']=part['bone'];obj['surface_material']=part['material'];obj['design_note']='Custom quad control surface; retain modifiers for editing.'
    objects.append(obj)
# The power aperture is cut through the resolved breastplate wall. The operand
# remains editable in the source file and is omitted from export and rendering.
outline=[]
for i in range(48):
    a=2*math.pi*i/48
    outline.append((.125*math.cos(a)*(.82+.18*math.sin(a)),3.58+.224*math.sin(a)))
verts=[point((x,y,z)) for z in [.32,.80] for x,y in outline]
faces=[list(reversed(range(48))),list(range(48,96))]+[[i,(i+1)%48,(i+1)%48+48,i+48] for i in range(48)]
cme=bpy.data.meshes.new('Lancet aperture operand');cme.from_pydata(verts,[],faces);cme.update()
bm=bmesh.new();bm.from_mesh(cme);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(cme);bm.free()
cutter=bpy.data.objects.new('Construction / power aperture',cme);collections['Core'].objects.link(cutter)
cutter.hide_render=True;cutter.hide_set(True);cutter.display_type='WIRE'
torso=next(o for o in objects if o.name=='Harness / shaped breast and back shell')
hole=torso.modifiers.new('Cut recessed core through the plate','BOOLEAN');hole.operation='DIFFERENCE';hole.solver='EXACT';hole.object=cutter
# Save evaluated bind geometry before adding the armature deformation. Three.js
# retains the original exact glTF animation tracks, without resampling them.
evaluated=[];runtime=[]
deps=bpy.context.evaluated_depsgraph_get()
def resolved(obj):
    ev=obj.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles()
    result={'name':obj.name,'bone':obj['attachment'],'material':obj['surface_material'],
        'positions':[[v.co.x,v.co.z,-v.co.y] for v in me.vertices],
        'colors':[list(c.color[:3]) for c in me.color_attributes['Patina'].data],
        'triangles':[list(t.vertices) for t in me.loop_triangles]}
    ev.to_mesh_clear();return result
for obj in objects:
    levels=[]
    for mod in obj.modifiers:
        if mod.type=='SUBSURF':levels.append((mod,mod.levels));mod.levels=1
        if mod.type=='BEVEL':mod.limit_method='ANGLE';mod.angle_limit=.6
    bpy.context.view_layer.update()
    detail=resolved(obj);evaluated.append(detail)
    # The authored quad cages are the game topology. Generic collapse reduction
    # destroys the narrow plate overlaps; retain their deliberate edge flow.
    for mod in obj.modifiers:
        if mod.type=='SUBSURF':mod.levels=0
        if mod.type=='BEVEL':mod.show_viewport=False
    bpy.context.view_layer.update();runtime.append(resolved(obj))
    for mod in obj.modifiers:
        if mod.type=='BEVEL':mod.show_viewport=True
    for mod,level in levels:mod.levels=level
    mod=obj.modifiers.new('Original Mike articulation','ARMATURE');mod.object=arm
with open(os.path.join(build,'evaluated.json'),'w') as f:json.dump(evaluated,f,separators=(',',':'))
with open(os.path.join(build,'evaluated-runtime.json'),'w') as f:json.dump(runtime,f,separators=(',',':'))
# Named native Blender actions are sampled from the supplied clips. The GLB uses
# the original tracks; the .blend exposes editable poses at 24 fps.
arm.animation_data_create()
for pb in arm.pose.bones:pb.rotation_mode='QUATERNION'
for clip in data['poses']:
    action=bpy.data.actions.new(clip['name']);action.use_fake_user=True;arm.animation_data.action=action
    for frame in clip['frames']:
        targets={item['name']:C@matrix(item['matrix']) for item in frame['bones']}
        for item in frame['bones']:
            pb=arm.pose.bones[item['name']]
            local=pb.bone.matrix_local.inverted()
            if pb.parent:local=local@pb.parent.bone.matrix_local@targets[pb.parent.name].inverted()
            pb.matrix_basis=local@targets[pb.name]
            pb.keyframe_insert('location',frame=frame['frame'],group=pb.name)
            pb.keyframe_insert('rotation_quaternion',frame=frame['frame'],group=pb.name)
            pb.keyframe_insert('scale',frame=frame['frame'],group=pb.name)
    action['source_clip']=clip['name'];action['source_duration_seconds']=clip['duration']
arm.animation_data.action=bpy.data.actions['Idle']
scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=1;scene.frame_end=round(arm.animation_data.action.frame_range[1]);scene.frame_set(13)
# CPU studio lighting; this build of Blender has no OpenImageDenoise support.
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.use_denoising=False
scene.cycles.samples=16;scene.cycles.use_adaptive_sampling=True;scene.cycles.adaptive_threshold=.065
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.world.color=(.18,.18,.18)
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.23,.25,.27,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
scene.view_settings.view_transform='AgX'
scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);collections['Studio'].objects.link(o);o.location=loc;aim(o,(0,0,2.6))
area('Large neutral key',(-4,-6,8),700,5,(1,.94,.87))
area('Broad cool fill',(5,-2,4),450,4,(.78,.87,1))
area('Back rim',(2,4,7),900,3,(1,.96,.9))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.06));floor=bpy.context.object;floor.name='Studio floor'
floor.data.materials.append(materials['floor'])
for c in list(floor.users_collection):c.objects.unlink(floor)
collections['Studio'].objects.link(floor)
camdata=bpy.data.cameras.new('Inspection camera');cam=bpy.data.objects.new('Inspection camera',camdata);collections['Studio'].objects.link(cam)
scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=6.6
cam.location=(7,-11,6.1);aim(cam,(0,0,2.55))
clay=bpy.data.materials.new('Neutral clay / geometry inspection');clay.diffuse_color=(.45,.43,.40,1);clay.use_nodes=True
clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.24,.23,.21,1)
clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.78
# Keep an equipment-free inspection collection toggle in the authored file.
bpy.ops.object.select_all(action='DESELECT');arm.hide_set(True)
torso.select_set(True);bpy.context.view_layer.objects.active=torso
for obj in collections['Studio'].objects:
    if obj.type in ['CAMERA','LIGHT']:obj.hide_set(True)
for screen in bpy.data.screens:
    for space in screen.areas:
        if space.type=='VIEW_3D':
            space.spaces.active.region_3d.view_distance=8
            space.spaces.active.region_3d.view_location=(0,0,2.5)
            space.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            space.spaces.active.shading.color_type='MATERIAL'
scene['asset_status']='In-game Relic Warden'
scene['graphics_workaround']='LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe blender'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(folder,'relic-warden.blend'))
views=[('clay-three-quarter',(7,-11,6.1),(0,0,2.55),6.6),
       ('clay-front',(0,-14,3.0),(0,0,2.65),6.3),
       ('clay-side',(14,0,3.0),(0,0,2.65),6.3),
       ('clay-back',(0,14,3.0),(0,0,2.65),6.3),
       ('material-three-quarter',(7,-11,6.1),(0,0,2.55),6.6),
       ('head-and-harness',(4,-9,5.2),(0,-.03,3.92),2.9)]
for name,loc,target,scale in views:
    requested=os.environ.get('WARDEN_VIEWS','all').split(',')
    if requested!=['all'] and name not in requested:continue
    scene.view_layers[0].material_override=clay if name.startswith('clay') else None
    # Leave equipment off in orthographic clay views to inspect the body beneath.
    collections['Equipment'].hide_render=name in ['clay-front','clay-side','clay-back']
    cam.location=loc;camdata.ortho_scale=scale;aim(cam,target)
    scene.render.filepath=os.path.join(build,name+'.png');bpy.ops.render.render(write_still=True)
    print('REVIEW_RENDER',name,flush=True)
print('WARDEN_BLENDER_COMPLETE',flush=True)
`;

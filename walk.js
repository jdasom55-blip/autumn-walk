import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { createSongbird } from './songbirds.js';
import { createCreekLife } from './creek-life.js';
import { createTrailSquirrels } from './trail-squirrels.js';

'use strict';
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const path = s => 3*Math.sin(s*.072);
const end = 91;
const walkSpeed = 1.2;
const bend = s => Math.atan2(path(s+.1)-path(s),.1);
let renderer,scene,camera,mode='intro',s=0,yaw=0,pitch=0,seed=1585;
const random = () => ((seed=Math.imul(1664525,seed)+1013904223|0)>>>0)/4294967296;
const between = (a,b) => a+(b-a)*random();
const names={chestnutTree:'밤송이가 달린 밤나무',chestnut:'따끔따끔 밤송이',frog:'개굴개굴 개구리',water:'졸졸졸 강물',bird:'짹짹짹 산새',reed:'사각사각 갈대',maple:'빨간 단풍나무',ginkgo:'노란 은행나무',brown:'도토리가 달린 참나무',bear:'친구 곰'};
const assetNames={start:'시작 화면',maple:'단풍나무',ginkgo:'은행나무',brown:'참나무',leaf:'낙엽',reed:'갈대',bird:'산새',water:'강물 텍스처',road:'흙길 텍스처',rami:'라미',bear:'곰'};
const urls={},trees=[],birds=[],reeds=[],leaves=[],targets=[],textures={};
const groups={};
const frogs=[];let nextFrogSound=0;
let frogCallBuffer=null,frogCallLoading=null,activeFrogCall=null;
let road,water,waterLines,noticeTimer,entryRoad;
const entryLighting={};
let vrMode;
function resizeScene(){
  const app=$('app');
  renderer.setSize(app.clientWidth,app.clientHeight,false);
  renderer.setViewport(0,0,app.clientWidth,app.clientHeight);
  camera.aspect=app.clientWidth/app.clientHeight;
  camera.updateProjectionMatrix();
  vrMode?.showHint();
}
async function openVRSetup(){
  try{
    if(!vrMode){
      const {SmartphoneVR}=await import('./vr-mode.js');
      vrMode=new SmartphoneVR({renderer,scene,camera,app:$('app'),
        onEnter:()=>setMode('walk'),onExit:()=>setMode('intro'),resize:resizeScene,
        path,end,onProgress:distance=>{s=distance;}});
    }
    vrMode.showSetup();
  }catch(error){
    $('error').hidden=false;
    $('error').textContent='VR 모드를 열지 못했어요. 일반 모드를 이용해 주세요.';
    console.error(error);
  }
}
const forestViews=[];
const forestFrustum=new THREE.Frustum();
const forestViewMatrix=new THREE.Matrix4();
const forestCameraPosition=new THREE.Vector3();
function updateForestVisibility(){
  camera.updateWorldMatrix(true,false);
  camera.getWorldPosition(forestCameraPosition);
  forestViewMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  forestFrustum.setFromProjectionMatrix(forestViewMatrix);
  for(const forest of forestViews){
    const visible=[];
    for(let i=0;i<forest.spheres.length;i++){
      const sphere=forest.spheres[i];
      if(forestCameraPosition.distanceTo(sphere.center)-sphere.radius<=55 &&
         forestFrustum.intersectsSphere(sphere))visible.push(i);
    }
    const signature=visible.join(',');
    if(signature===forest.signature)continue;
    forest.signature=signature;
    for(const mesh of forest.meshes){
      const matrices=mesh.userData.placementMatrices;
      visible.forEach((source,index)=>mesh.setMatrixAt(index,matrices[source]));
      mesh.count=visible.length;mesh.instanceMatrix.needsUpdate=true;
    }
  }
}
function material(color){return new THREE.MeshLambertMaterial({color,flatShading:true});}
function mesh(geo,mat,parent,x,y,z){
  const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);parent.add(o);return o;
}
function group(parent,x,y,z){
  const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;
}
function mark(o,type){if(names[type]){o.userData.label=names[type];targets.push(o);}return o;}
function strip(a,b,left,right,height,mat){
  const p=[],uv=[],idx=[];
  for(let i=0;i<=b-a;i++){
    const d=a+i;p.push(path(d)+left,height,-d,path(d)+right,height,-d);
    uv.push(0,d/6,1,d/6);
    if(i){const n=i*2;idx.push(n-2,n-1,n,n-1,n+1,n);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();return mesh(geo,mat,scene,0,0,0);
}
function batch(geo,mat,items,parent=scene){
  const o=new THREE.InstancedMesh(geo,mat,items.length),d=new THREE.Object3D();
  items.forEach(([x,y,z,sx,sy,sz,angle,color],i)=>{
    d.position.set(x,y,z);d.scale.set(sx,sy,sz);d.rotation.set(0,angle,0);
    d.updateMatrix();o.setMatrixAt(i,d.matrix);
    if(color)o.setColorAt(i,new THREE.Color(color));
  });parent.add(o);return o;
}
function buildBroadleaf(key){
  const ginkgo=key==='ginkgo',oak=key==='brown';
  const palette=ginkgo?['#eaa51e','#f6c32c','#efb522','#f6cf46','#d99520']:oak?['#d97b37','#e9a02d','#bd8e37','#ad963e','#e18b38']:['#e65b41','#ed7940','#f29948','#efb64c','#d9583b'];
  const wood=[],crowns=[],leaves=[];
  const up=new THREE.Vector3(0,1,0);
  const makePart=(position,scale,rotation,color)=>({position,scale,rotation,color});
  const vector=(x,y,z)=>new THREE.Vector3(x,y,z);
  const euler=(x,y,z)=>new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z));
  function limb(from,to,radius,color){
    const a=vector(...from),b=vector(...to),direction=b.clone().sub(a);
    return makePart(a.lerp(b,.5),vector(radius,direction.length()+radius*.27,radius),
      new THREE.Quaternion().setFromUnitVectors(up,direction.normalize()),color);
  }
  wood.push(limb([0,-.03,0],[.01,.65,0],.36,'#875031'));
  wood.push(limb([.01,.61,0],[-.05,1.39,.05],.27,'#945735'));
  wood.push(limb([-.05,1.34,.05],[.07,2.13,.01],.21,'#a26039'));
  for(let k=0;k<5;k++){
    const a=k*Math.PI*2/5, x=Math.cos(a),z=Math.sin(a);
    wood.push(limb([x*.57,.02,z*.57],[x*.08,.44,z*.08],.13,'#865033'));
    wood.push(limb([-.02,1.05+k*.071,0],[x*.68,1.75,z*.68],.17,'#955736'));
    wood.push(limb([x*.63,1.71,z*.63],[x*1.02,2.19,z*1.02],.105,'#a25b34'));
    wood.push(limb([x*.69,1.76,z*.69],[x*.64-z*.31,2.32,z*.64+x*.31],.075,'#a76337'));
  }
  crowns.push(makePart(vector(0,2.58,0),vector(.96,.85,.91),euler(0,0,0),palette[0]));
  for(let i=0;i<10;i++){
    const a=i*Math.PI*2/10, x=Math.cos(a),z=Math.sin(a);
    const y=i%2===0?2.24:2.64, r=i%2===0?.96:.77;
    crowns.push(makePart(vector(x*r,y,z*r),vector(.71,.64,.72),euler(0,a,0),palette[i%palette.length]));
  }
  const leafCount=oak?26:ginkgo?34:46;
  for(let i=0;i<leafCount;i++){
    const a=i*2.39996, vertical=1-2*(i+.5)/leafCount, radius=Math.sqrt(1-vertical*vertical);
    const x=Math.cos(a)*radius,z=Math.sin(a)*radius;
    const normal=vector(x,vertical*.7,z).normalize();
    const rotation=new THREE.Quaternion().setFromUnitVectors(vector(0,0,1),normal);
    rotation.multiply(euler(0,0,ginkgo?Math.sin(i*2.4)*.52:i*.77));
    const size=.33+(i%4)*.038;
    leaves.push(makePart(vector(x*1.65,2.47+vertical*.99,z*1.65),vector(size,size,size),rotation,palette[(i*3)%palette.length]));
  }

  // Each maple leaf has a raised center, five lobes, and a vein texture.
  const oakEdge=[[.12,-.52],[.19,-.39],[.40,-.32],[.44,-.23],[.36,-.16],
    [.32,-.09],[.50,.00],[.52,.12],[.45,.18],[.32,.21],[.32,.29],
    [.42,.40],[.38,.51],[.28,.56],[.18,.50],[.14,.66],[.08,.74]];
  const outline=oak?[[0,-.67],...oakEdge,[0,.77],...[...oakEdge].reverse().map(([x,y])=>[-x,y])]:ginkgo?[[0,-.73],[.075,-.52],[.14,-.30],[.33,-.16],[.59,-.06],
    [.74,.09],[.72,.27],[.60,.42],[.42,.54],[.20,.61],[.06,.54],
    [0,.45],[-.06,.54],[-.20,.61],[-.42,.54],[-.60,.42],[-.72,.27],
    [-.74,.09],[-.59,-.06],[-.33,-.16],[-.14,-.30],[-.075,-.52]]:[[0,-.48],[.15,-.33],[.43,-.43],[.39,-.16],[.75,.03],[.52,.15],
    [.76,.46],[.35,.41],[.18,.3],[0,.77],[-.18,.3],[-.35,.41],[-.76,.46],
    [-.52,.15],[-.75,.03],[-.39,-.16],[-.43,-.43],[-.15,-.33]];
  const leafGeo=new THREE.BufferGeometry(),positions=[0,0,.145],uv=[.5,.5],indices=[];
  const rim=outline.flatMap(([x,y],i)=>{
    const [px,py]=outline[(i+outline.length-1)%outline.length];
    const [nx,ny]=outline[(i+1)%outline.length];
    return [[x*.78+px*.22,y*.78+py*.22],
      [x*.78+nx*.22,y*.78+ny*.22]];
  });
  const rings=[.52,1],count=rim.length;
  rings.forEach((r,ring)=>rim.forEach(([x,y],i)=>{
    const z=.145*(1-r*r)-.072*y*r+.022*Math.cos(i*Math.PI/9)*r*r;
    positions.push(x*r,y*r,z);uv.push(.5+x*r*.61,.5+y*r*.61);
    const a=1+ring*count+i,b=1+ring*count+(i+1)%count;
    if(ring===0)indices.push(0,a,b);
    else indices.push(a-count,a,b,a-count,b,b-count);
  }));
  leafGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  leafGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  leafGeo.setIndex(indices);leafGeo.computeVertexNormals();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  const wash=ctx.createRadialGradient(59,57,3,64,64,85);
  wash.addColorStop(0,'#fff6e4');wash.addColorStop(.62,'#f3e5cf');wash.addColorStop(1,'#d6b899');
  ctx.fillStyle=wash;ctx.fillRect(0,0,128,128);
  for(let i=0;i<360;i++){
    ctx.fillStyle=i%2?'#fff4db45':'#97644125';
    ctx.fillRect((i*73)%128,(i*53+i*i)%128,2,2);
  }
  ctx.strokeStyle='#fff9e694';ctx.lineWidth=1.5;
  const vein=(x,y)=>{
    ctx.beginPath();ctx.moveTo(64,ginkgo?117:99);ctx.quadraticCurveTo(64,59,x,y);ctx.stroke();
  };
  if(ginkgo){
    for(let i=0;i<11;i++){
      const angle=.15+i*(Math.PI-.3)/10;
      vein(64+57*Math.cos(angle),72-58*Math.sin(angle));
    }
  }else{
    vein(64,8);vein(120,28);vein(8,28);vein(109,64);vein(19,64);
  }
  ctx.strokeStyle='#fff9e64d';ctx.lineWidth=.8;
  for(let i=0;!ginkgo&&i<7;i++){
    const y=33+i*8;
    for(const side of [-1,1]){
      ctx.beginPath();ctx.moveTo(64,y+8);
      ctx.quadraticCurveTo(64+side*9,y+1,64+side*(15+i*2),y-3);ctx.stroke();
    }
  }
  const veins=new THREE.CanvasTexture(canvas);veins.colorSpace=THREE.SRGBColorSpace;

  const broadleaves=trees.filter(t=>t.key===key);
  function place(geo,mat,parts){
    const instances=new THREE.InstancedMesh(geo,mat,broadleaves.length*parts.length);
    const root=new THREE.Object3D(),piece=new THREE.Matrix4(),matrix=new THREE.Matrix4();
    let index=0;
    broadleaves.forEach(({x,d,h},i)=>{
      const center=path(d),offset=x-center;
      // Root flare stays outside the path, whose half-width is 2.65.
      root.position.set(center+Math.sign(offset)*Math.max(4.25,Math.abs(offset)),0,-d);
      root.rotation.y=i*2.39996;
      const size=.68+(h-3.1)*.32;
      const width=oak?size*1.12:size;
      root.scale.set(width,ginkgo?size*1.15:size,width);
      root.updateMatrix();
      for(const part of parts){
        piece.compose(part.position,part.rotation,part.scale);
        instances.setMatrixAt(index,matrix.multiplyMatrices(root.matrix,piece));
        instances.setColorAt(index++,new THREE.Color(part.color));
      }
    });
    instances.userData.treeSources=broadleaves;
    instances.userData.partsPerTree=parts.length;
    scene.add(instances);return mark(instances,key);
  }
  const smooth=color=>new THREE.MeshLambertMaterial({color});
  const barkCanvas=document.createElement('canvas');barkCanvas.width=barkCanvas.height=128;
  const bark=barkCanvas.getContext('2d');
  bark.fillStyle='#f2dfc8';bark.fillRect(0,0,128,128);
  for(let i=0;i<34;i++){
    const x=i*128/34;
    bark.strokeStyle=i%3?'#ac79562b':'#fff2db85';bark.lineWidth=1+i%3;
    bark.beginPath();bark.moveTo(x,0);
    bark.bezierCurveTo(x+4*Math.sin(i),38,x+5*Math.cos(i),84,x,128);bark.stroke();
  }
  const barkTexture=new THREE.CanvasTexture(barkCanvas);barkTexture.colorSpace=THREE.SRGBColorSpace;
  const barkMaterial=smooth('#ffffff');barkMaterial.map=barkTexture;
  place(new THREE.CylinderGeometry(.74,1,1,12,3),barkMaterial,wood);
  const crownGeo=new THREE.SphereGeometry(1,12,8);
  const points=crownGeo.getAttribute('position');
  for(let i=0;i<points.count;i++){
    const x=points.getX(i),y=points.getY(i),z=points.getZ(i);
    const bulge=1+.055*Math.sin(x*10+y*6)*Math.cos(z*8-y*3);
    points.setXYZ(i,x*bulge,y*bulge,z*bulge);
  }
  // Original sphere normals keep the softly lit surface continuous at the UV seam.
  place(crownGeo,smooth('#ffffff'),crowns);
  if(oak){
    const acorns=[];
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5,x=Math.cos(a),z=Math.sin(a);
      for(const side of [-1,1]){
        const px=x*1.03-z*side*.105,pz=z*1.03+x*side*.105;
        const y=1.87+i*.026+side*.033;
        const angle=euler(z*side*.22,0,x*side*.22);
        acorns.push(makePart(vector(px,y,pz),vector(.091,.127,.093),angle,'#c88032'));
        acorns.push(makePart(vector(px,y+.084,pz),vector(.106,.052,.109),angle,'#784629'));
        acorns.push(makePart(vector(px,y+.15,pz),vector(.021,.058,.021),angle,'#88502a'));
      }
    }
    place(new THREE.SphereGeometry(1,8,6),smooth('#ffffff'),acorns);
  }
  const leafMaterial=smooth('#ffffff');leafMaterial.map=veins;leafMaterial.side=THREE.DoubleSide;
  groups[key]={leaves:place(leafGeo,leafMaterial,leaves),veins};
}
const leafCanopies=[];
async function loadForestModel(key,file,heightFactor=1){
  const matchingTrees=trees.filter(tree=>tree.key===key);
  try{
    const gltf=await new GLTFLoader().loadAsync(file);
    const model=gltf.scene;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model);
    const dimensions=bounds.getSize(new THREE.Vector3());
    if(!Number.isFinite(dimensions.y)||dimensions.y<=0)throw new Error('Invalid maple bounds');
    const middle=bounds.getCenter(new THREE.Vector3());
    // Bound the crown with a circle so rotation never moves a branch into the path.
    const radius=Math.hypot(dimensions.x,dimensions.z)/2;
    const root=new THREE.Object3D(),pivot=new THREE.Matrix4();
    const placements=matchingTrees.map((tree,i)=>{
      const center=path(tree.d),offset=tree.x-center;
      const x=center+Math.sign(offset)*Math.max(4.25,Math.abs(offset));
      const height=heightFactor*3.45*(.68+(tree.h-3.1)*.32);
      const scale=Math.min(height/dimensions.y,(Math.abs(x-center)-2.95)/radius);
      root.position.set(x,.025,-tree.d);
      root.rotation.y=i*2.39996323;
      root.scale.setScalar(scale);root.updateMatrix();
      pivot.makeTranslation(-middle.x,-bounds.min.y,-middle.z);
      return root.matrix.clone().multiply(pivot);
    });
    // Sample the upper foliage in model space, then use the same transforms as the trees.
    const canopyPoints=[],point=new THREE.Vector3();
    model.traverse(object=>{
      if(!object.isMesh)return;
      const position=object.geometry.getAttribute('position');
      const stride=Math.max(1,Math.floor(position.count/160));
      for(let i=0;i<position.count;i+=stride){
        point.fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld);
        const level=(point.y-bounds.min.y)/dimensions.y;
        if(level>.68&&level<.88)canopyPoints.push(point.clone());
      }
    });
    matchingTrees.forEach((tree,i)=>{
      const trailX=path(tree.d);
      if(Math.abs(tree.x-trailX)>12)return;
      let bestScore=Infinity,origin;
      for(const sample of canopyPoints){
        point.copy(sample).applyMatrix4(placements[i]);
        const score=Math.abs(point.x-trailX)+.6*Math.abs(point.z+tree.d);
        if(score<bestScore){bestScore=score;origin=point.clone();}
      }
      if(origin)leafCanopies.push(origin);
    });
    const replacement=new THREE.Group();replacement.name=key+'-glb-forest';
    const localSphere=bounds.getBoundingSphere(new THREE.Sphere());
    const forestView={spheres:placements.map(matrix=>localSphere.clone().applyMatrix4(matrix)),
      meshes:[],signature:null};
    model.traverse(object=>{
      if(!object.isMesh)return;
      const instances=new THREE.InstancedMesh(object.geometry,object.material,matchingTrees.length);
      const matrices=placements.map(placement=>new THREE.Matrix4().multiplyMatrices(placement,object.matrixWorld));
      matrices.forEach((matrix,i)=>instances.setMatrixAt(i,matrix));
      instances.userData.placementMatrices=matrices;
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      forestView.meshes.push(instances);
      instances.instanceMatrix.needsUpdate=true;
      instances.castShadow=true;instances.receiveShadow=true;
      instances.computeBoundingBox();instances.computeBoundingSphere();
      replacement.add(instances);
    });
    if(!replacement.children.length)throw new Error('Empty maple model');
    // Retire the procedural tree components together after the shared model is ready.
    for(let i=targets.length-1;i>=0;i--){
      const object=targets[i];
      if(object.userData.label!==names[key])continue;
      object.removeFromParent();targets.splice(i,1);
      object.geometry?.dispose();object.material?.dispose();
    }
    groups[key]?.veins.dispose();delete groups[key];
    scene.add(mark(replacement,key));
    forestViews.push(forestView);
    renderer.shadowMap.needsUpdate=true;
  }catch(error){
    console.error(names[key]+' 모델을 불러오지 못했어요.',error);
    $('notice').textContent=names[key]+' 모델을 불러오지 못했어요. 새로고침해 주세요.';
    $('notice').hidden=false;
  }
}
// Terrain upgrade: gentle, continuous embankments outside the existing walking corridor.
// The original flat ground, trail, creek, and all interaction objects remain intact.
async function loadBirdPerchTrees(){
  const loader=new GLTFLoader();
  const results=await Promise.allSettled([
    loader.loadAsync('./models/autumn_maple_tree.glb'),
    loader.loadAsync('./models/golden_ginkgo_tree.glb')
  ]);
  birds.forEach((entry,i)=>{
    const kind=i%2,result=results[kind];
    if(result.status!=='fulfilled'){console.error('산새 나무 모델 로딩 실패',result.reason);return;}
    const model=result.value.scene.clone(true);model.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(model),centre=box.getCenter(new THREE.Vector3());
    const scale=(kind?5.0:4.8)/box.getSize(new THREE.Vector3()).y;
    model.scale.setScalar(scale);model.position.set(-centre.x*scale,-box.min.y*scale,-centre.z*scale);
    const tree=new THREE.Group();tree.name='songbird-perch-'+(kind?'ginkgo':'maple');
    tree.add(model);tree.position.set(entry.treeX,.025,-entry.d);
    tree.rotation.y=i*.7;
    model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
    scene.add(tree);
  });
  renderer.shadowMap.needsUpdate=true;
}
async function loadAnimalModels(){
  const loader=new GLTFLoader();
  function fit(model,height){
    model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model);
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(!Number.isFinite(size.y)||size.y<=0)throw new Error('Invalid animal bounds');
    const wrapper=new THREE.Group(),scale=height/size.y;
    model.scale.setScalar(scale);
    model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
    model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
    wrapper.add(model);return wrapper;
  }
  const results=await Promise.allSettled([
    loader.loadAsync('./models/songbird_animated_no_branch.glb'),
    loader.loadAsync('./models/rami_bear_friendly_wave.glb'),
    loader.loadAsync('./models/forest_tree_stump.glb')
  ]);
  try{
    if(results[0].status!=='fulfilled')throw results[0].reason;
    birds.forEach((entry,i)=>{
      const animation=createSongbird(results[0].value,i);
      entry.bird.removeFromParent();
      const target=targets.indexOf(entry.bird);if(target>=0)targets.splice(target,1);
      entry.anchor.add(mark(animation.wrapper,'bird'));entry.animation=animation;
      // A short fork beneath the forward-facing beak makes its peck target visible.
      const start=new THREE.Vector3(0,0,0),tip=new THREE.Vector3(0,.075,.46);
      const fork=new THREE.Mesh(new THREE.CylinderGeometry(.035,.065,start.distanceTo(tip),12),
        new THREE.MeshStandardMaterial({color:'#805432',roughness:1}));
      fork.position.copy(tip).multiplyScalar(.5);fork.position.y-=.06;
      fork.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),tip.clone().normalize());
      const twig=new THREE.Group();twig.rotation.y=animation.wrapper.rotation.y;
      twig.add(fork);entry.anchor.add(twig);
    });
  }catch(error){
    console.error('산새 모델 또는 애니메이션을 불러오지 못했어요.',error);
    $('notice').textContent='산새 모델 또는 애니메이션을 불러오지 못했어요. 새로고침해 주세요.';
    $('notice').hidden=false;
  }
  if(results[1].status==='fulfilled'){
    const source=results[1].value.scene;
    // Preserve the smile material and render the vertex-coloured fur as matte.
    const furMaterial=new THREE.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:.86});
    source.traverse(object=>{
      if(!object.isMesh)return;
      if(!object.geometry.attributes.normal)object.geometry.computeVertexNormals();
      if(object.geometry.attributes.color)object.material=furMaterial;
    });
    const arm=source.getObjectByName('right_arm_waving');
    if(arm){
      const pivot=new THREE.Group();pivot.name='bear_greeting_wrist';
      pivot.position.set(-.87,2.15,-.13);arm.parent.add(pivot);source.updateMatrixWorld(true);
      for(const name of ['right_paw','paw_pad','toe_pad_0','toe_pad_1','toe_pad_2']){
        const part=source.getObjectByName(name);if(part)pivot.attach(part);
      }
      const times=[0,1,1.6,2.2,2.8,3.4,4,8],angles=[0,0,.07,-.07,.07,-.07,0,0];
      const values=angles.flatMap(angle=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),angle).toArray());
      const clip=new THREE.AnimationClip('GentleGreeting',8,[new THREE.QuaternionKeyframeTrack('bear_greeting_wrist.quaternion',times,values)]);
      groups.bearMixer=new THREE.AnimationMixer(source);groups.bearMixer.clipAction(clip).play();
    }
    const bear=fit(source,2.15);
    bear.name='friendly-bear-at-trail-end';
    bear.position.set(path(94),.025,-94);
    bear.rotation.y=Math.PI-bend(end);
    scene.add(mark(bear,'bear'));
  }else console.error('곰 모델을 불러오지 못했어요.',results[1].reason);
  if(results[2].status==='fulfilled'){
    const stump=fit(results[2].value.scene,.48);
    stump.name='tree-stump-at-trail-end';
    stump.position.set(path(94)+1.75,.025,-94.6);
    scene.add(stump);
  }else console.error('그루터기 모델을 불러오지 못했어요.',results[2].reason);
  renderer.shadowMap.needsUpdate=true;
}
function buildRollingTerrain(){
  const sections=220,across=22;
  const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
  for(const side of [-1,1]){
    const positions=[],colors=[],indices=[];
    for(let row=0;row<=sections;row++){
      const d=-30+row;
      // On the creek side, keep the existing stream and banks completely unobstructed.
      const creekSide=side===1;
      const inner=creekSide?9.3:3.12;
      const outer=creekSide?24:23;
      for(let col=0;col<=across;col++){
        const u=col/across,offset=inner+(outer-inner)*u;
        const x=path(d)+side*offset;
        const fade=smooth((offset-inner)/(creekSide?4.2:7.5));
        const longWave=1.0+.40*Math.sin(d*.12+side*.9)+.24*Math.sin(d*.043+side*1.7);
        const gentle=.08*Math.sin(d*.31+offset*.41)+.055*Math.sin(d*.18-offset*.57);
        const y=.008+fade*Math.max(.08,longWave+gentle);
        positions.push(x,y,-d);
        const shade=.92+.07*Math.sin(d*.18+offset*.3);
        const color=new THREE.Color().setRGB(.40*shade,.45*shade,.25*shade);
        colors.push(color.r,color.g,color.b);
        if(row&&col){
          const a=(row-1)*(across+1)+col-1,b=a+1,c=row*(across+1)+col-1;
          // Two-sided material avoids orientation-specific holes.
          indices.push(a,b,c,b,c+1,c);
        }
      }
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.setIndex(indices);geo.computeVertexNormals();
    const terrain=mesh(geo,mat,scene,0,0,0);
    terrain.name=side===-1?'rolling-terrain-left':'rolling-terrain-right';
    terrain.receiveShadow=true;
  }
}
function creekBanks(d){
  const fade=1;
  return {near:3.55+fade*(.32+.32*Math.sin(d*.46+.3)),
    far:8.5+fade*(-.42+.38*Math.sin(d*.33+1.4))};
}
function buildCreekSample(){
  const first=-25,last=180;
  // One continuous translucent sky-blue surface replaces both old river sections.
  water.visible=false;waterLines.visible=false;
  const positions=[],uv=[],indices=[],segments=820,across=10;
  for(let row=0;row<=segments;row++){
    const d=first+(last-first)*row/segments;
    const banks=creekBanks(d);
    for(let col=0;col<=across;col++){
      const u=col/across;
      const depthFade=THREE.MathUtils.smoothstep(d-first,0,.75)*THREE.MathUtils.smoothstep(last-d,0,.75);
      positions.push(path(d)+banks.near+u*(banks.far-banks.near),.042+.118*depthFade,-d);
      uv.push(u,d);
      if(row&&col){
        const a=(row-1)*(across+1)+col-1,b=a+1,c=row*(across+1)+col-1;
        indices.push(a,b,c,b,c+1,c);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const waterMaterial=new THREE.ShaderMaterial({
    uniforms:{time:{value:0},deepColor:{value:new THREE.Color('#72b7be')},shallowColor:{value:new THREE.Color('#b1dce3')}},
    transparent:true,depthWrite:false,
    vertexShader:`
      uniform float time;
      varying vec2 flowUV;
      void main(){
        flowUV=uv;
        vec3 point=position;
        point.y+=.0012*sin(uv.y*3.1-time*.38)*sin(uv.x*12.+uv.y*.8);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(point,1.);
      }`,
    fragmentShader:`
      uniform float time;
      uniform vec3 deepColor;
      uniform vec3 shallowColor;
      varying vec2 flowUV;
      void main(){
        float travel=flowUV.y-time*.20;
        float ripple=sin(travel*5.5+sin(flowUV.x*16.+travel*.7)*.45);
        float second=sin(travel*9.3+flowUV.x*21.+sin(travel*1.7));
        float gentle=.5+.5*(ripple*.65+second*.35);
        float fine=sin(travel*15.+flowUV.x*28.)*.5+.5;
        float shore=1.-smoothstep(.03,.20,flowUV.x)*smoothstep(.03,.20,1.-flowUV.x);
        vec3 color=mix(deepColor,shallowColor,.36+gentle*.18+shore*.12+fine*.025);
        float endFade=smoothstep(-25.,-18.,flowUV.y)*(1.-smoothstep(155.,180.,flowUV.y));
        gl_FragColor=vec4(color,(.36+gentle*.055)*endFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const surface=mark(mesh(geometry,waterMaterial,scene,0,0,0),'water');
  surface.name='creek-sample-water';surface.renderOrder=2;
  groups.creekSample=surface;
  // Smooth sand bed, rounded submerged stones, and restrained banks.
  const sand=new THREE.MeshStandardMaterial({color:'#b5a286',roughness:1});
  const bedGeometry=geometry.clone();
  const bedPositions=bedGeometry.getAttribute('position');
  for(let i=0;i<bedPositions.count;i++)bedPositions.setY(i,.028);
  bedPositions.needsUpdate=true;bedGeometry.computeVertexNormals();
  mesh(bedGeometry,sand,scene,0,0,0).receiveShadow=true;
  const bankPositions=[],bankIndices=[];
  for(let side=0;side<2;side++){
    const start=bankPositions.length/3;
    for(let row=0;row<=segments;row++){
      const d=first+(last-first)*row/segments,banks=creekBanks(d);
      const outer=side===0?3.15:8.9,inner=side===0?banks.near:banks.far;
      bankPositions.push(path(d)+outer,.04,-d,path(d)+inner,.115,-d);
      if(row){const a=start+row*2;bankIndices.push(a-2,a-1,a,a-1,a+1,a);}
    }
  }
  const bankGeometry=new THREE.BufferGeometry();
  bankGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bankPositions,3));
  bankGeometry.setIndex(bankIndices);bankGeometry.computeVertexNormals();
  mesh(bankGeometry,new THREE.MeshStandardMaterial({color:'#a99b77',roughness:1,side:THREE.DoubleSide}),scene,0,0,0).receiveShadow=true;
  let creekSeed=9721;
  const rand=()=>((creekSeed=Math.imul(creekSeed,1664525)+1013904223|0)>>>0)/4294967296;
  const pebbles=[],bankRocks=[],grass=[];
  for(let i=0;i<377;i++){
    const d=first+.2+rand()*(last-first-.4),x=path(d)+creekBanks(d).near+.2+rand()*(creekBanks(d).far-creekBanks(d).near-.4),size=.07+rand()*.12;
    pebbles.push([x,.048,-d,size,.024+rand()*.035,size*.75,rand()*6.28,
      ['#b4ad9b','#969e98','#c1b7a4','#a99d89'][i%4]]);
  }
  for(let i=0;i<104;i++){
    const d=first+.3+rand()*(last-first-.6),side=i%2?1:-1;
    const x=path(d)+(side===-1?creekBanks(d).near-.14:creekBanks(d).far+.16),size=.09+rand()*.18;
    bankRocks.push([x,.085,-d,size,size*.5,size*.8,rand()*6.28,i%2?'#aaa99b':'#bcb6a3']);
    for(let k=0;k<3;k++){
      const h=.15+rand()*.15;
      grass.push([x+side*.13+k*.025,.04+h*.5,-d+.17,h*.17,h,h*.17,rand()*6.28,i%2?'#8d9c65':'#b2ae70']);
    }
  }
  const roundStone=new THREE.SphereGeometry(1,12,8);
  batch(roundStone,new THREE.MeshStandardMaterial({color:'#fff',roughness:1}),pebbles).receiveShadow=true;
  batch(roundStone,new THREE.MeshStandardMaterial({color:'#fff',roughness:1}),bankRocks).receiveShadow=true;
  batch(new THREE.ConeGeometry(1,1,10),new THREE.MeshStandardMaterial({color:'#fff',roughness:1}),grass);
}
function buildDistantMountains(){
  // Fixed world-space scenic backdrop, shared by both eyes; never follows head rotation.
  const texture=new THREE.TextureLoader().load('./autumn-mountains.png');
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  const geometry=new THREE.PlaneGeometry(275,137.5);
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,
    alphaTest:.02,depthWrite:false,side:THREE.DoubleSide,fog:false,toneMapped:false});
  const mountains=new THREE.Group();mountains.name='distant-autumn-mountains';
  for(let i=0;i<6;i++){
    const angle=i*Math.PI/3;
    const mountain=new THREE.Mesh(geometry,material);
    const height=[1,.86,1.06,.9,1.02,.83][i];
    mountain.position.set(Math.sin(angle)*225,-22+137.5*height/2,-45-Math.cos(angle)*225);
    mountain.scale.y=height;
    mountain.lookAt(0,mountain.position.y,-45);
    mountain.renderOrder=-1;
    mountains.add(mountain);
  }
  scene.add(mountains);
}
async function loadCreekRockImages(){
  try{
    const atlas=await new THREE.TextureLoader().loadAsync('./creek-flower-rocks.png');
    atlas.colorSpace=THREE.SRGBColorSpace;
    const geometry=new THREE.PlaneGeometry(1,1);geometry.translate(0,.5,0);
    const materials=[];
    for(let kind=0;kind<6;kind++){
      const texture=atlas.clone();
      texture.repeat.set(1/3,.5);texture.offset.set((kind%3)/3,kind<3?.5:0);texture.needsUpdate=true;
      materials.push(new THREE.MeshBasicMaterial({map:texture,alphaTest:.12,
        side:THREE.DoubleSide,toneMapped:false}));
    }
    const rocks=new THREE.Group();rocks.name='creek-flowering-rock-images';
    let rockSeed=21873;
    const rand=()=>((rockSeed=Math.imul(rockSeed,1664525)+1013904223|0)>>>0)/4294967296;
    const placed=[];
    // Unequal clusters leave quiet stretches of open water between rocky banks.
    for(const centre of [-8,4.3,8.1,13.8,19.2,24.7,28.8,37.5,46.2,54.8,64.3,75.6,84.1,96.5,107]){
      const count=3+Math.floor(rand()*4);
      const preferredNear=rand()<.5;
      for(let j=0;j<count;j++){
        const d=clamp(centre+(rand()-.5)*3.2,-12,112);
        const near=rand()<.72?preferredNear:!preferredNear;
        const banks=creekBanks(d),h=(near?.46:.65)+rand()*(near?.47:.85);
        const x=path(d)+(near?banks.near-.12: banks.far+.13)+(rand()-.5)*.18;
        if(placed.some(p=>Math.hypot(p.x-x,p.d-d)<.48))continue;
        placed.push({x,d});
        const rock=new THREE.Mesh(geometry,materials[Math.floor(rand()*6)]);
        rock.scale.set(h*(.85+rand()*.3),h,1);
        rock.position.set(x,.035,-d);
        rock.lookAt(path(d)+(rand()-.5),rock.position.y,-d+1.8+rand()*3.5);
        rocks.add(rock);
      }
    }
    scene.add(rocks);
  }catch(error){console.error('개울 바위 이미지를 불러오지 못했어요.',error);}
}
async function loadTrailChestnuts(){
  try{
    const gltf=await new GLTFLoader().loadAsync('./models/open_chestnut_burr.glb');
    const model=gltf.scene;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    if(size.y<=0||!Number.isFinite(size.y))throw new Error('Invalid chestnut bounds');
    const centre=bounds.getCenter(new THREE.Vector3());
    let chestSeed=29173;
    const rand=()=>((chestSeed=Math.imul(chestSeed,1664525)+1013904223|0)>>>0)/4294967296;
    const transforms=[],dummy=new THREE.Object3D(),pivot=new THREE.Matrix4().makeTranslation(-centre.x,-bounds.min.y,-centre.z);
    for(const stop of [5,17,31,44,56,69,83,90]){
      const side=rand()<.5?-1:1;
      const count=3+Math.floor(rand()*3);
      for(let i=0;i<count;i++){
        const d=stop+(rand()-.5)*2.9,off=(rand()<.8?side:-side)*(1.8+rand()*.75);
        const scale=(.16+rand()*.11)/size.y;
        dummy.position.set(path(d)+off,0,-d);dummy.scale.setScalar(scale);
        dummy.rotation.set((rand()-.5)*.3,rand()*Math.PI*2,(rand()-.5)*.4);dummy.updateMatrix();
        const transform=dummy.matrix.clone().multiply(pivot);
        const bottom=bounds.clone().applyMatrix4(transform).min.y;
        transform.elements[13]+=trailSurfaceHeight(d,off)+.002-bottom;
        transforms.push(transform);
      }
    }
    const patch=new THREE.Group();patch.name='fallen-chestnut-burrs';
    model.traverse(object=>{
      if(!object.isMesh)return;
      const instances=new THREE.InstancedMesh(object.geometry,object.material,transforms.length);
      transforms.forEach((matrix,i)=>instances.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(matrix,object.matrixWorld)));
      instances.instanceMatrix.needsUpdate=true;instances.computeBoundingSphere();instances.receiveShadow=true;patch.add(instances);
    });
    scene.add(mark(patch,'chestnut'));
  }catch(error){console.error('밤송이 모델을 불러오지 못했어요.',error);}
}
async function loadCreekFrogs(){
  try{
    const gltf=await new GLTFLoader().loadAsync('./models/woodland_frog_character.glb');
    gltf.scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(gltf.scene),centre=bounds.getCenter(new THREE.Vector3());
    const height=bounds.getSize(new THREE.Vector3()).y;
    if(!Number.isFinite(height)||height<=0)throw new Error('개구리 모델 크기를 확인할 수 없어요.');
    const rockGeo=new THREE.SphereGeometry(1,20,12);
    const rockMat=new THREE.MeshStandardMaterial({color:'#939d8d',roughness:1});
    for(const [i,d] of [8,24,42,59,78].entries()){
      const b=creekBanks(d),x=path(d)+b.near+.31;
      const rock=mesh(rockGeo,rockMat,scene,x,.085,-d);
      rock.scale.set(.43,.225,.38);rock.receiveShadow=true;
      const frog=new THREE.Group(),model=gltf.scene.clone(true),scale=(.1875+i%3*.01875)/height;
      model.scale.setScalar(scale);model.position.set(-centre.x*scale,-bounds.min.y*scale,-centre.z*scale);
      const perchY=rock.position.y+rock.scale.y;
      frog.add(model);frog.position.set(x,perchY,-d);frog.rotation.y=[-1.65,.80,2.75,-.35,1.82][i];
      frog.name='creek-rock-frog-'+i;scene.add(mark(frog,'frog'));
      frogs.push({model:frog,d,x,perchY,nextCall:0});
    }
  }catch(error){console.error('개구리 모델을 불러오지 못했어요.',error);}
}
function updateCreekFrogs(time){
  frogs.forEach(({model,perchY},i)=>{
    // Stagger a pair of small hops and return to the same spot on the rock.
    const phase=(time+i*2.1)%(8.2+i*1.15);
    const first=clamp(phase/.34,0,1);
    const second=clamp((phase-.46)/.30,0,1);
    model.position.y=perchY+.04*Math.sin(Math.PI*first)**2+.028*Math.sin(Math.PI*second)**2;
  });
}
function loadFrogRecording(){
  if(frogCallLoading||!audio)return;
  frogCallLoading=fetch('./audio/frog-call.mp3').then(response=>{
    if(!response.ok)throw new Error('개구리 음원 HTTP '+response.status);
    return response.arrayBuffer();
  }).then(bytes=>audio.decodeAudioData(bytes)).then(buffer=>{frogCallBuffer=buffer;})
    .catch(error=>{console.error('개구리 음원을 불러오지 못했어요.',error);});
}
function playFrogCall(level){
  if(!frogCallBuffer||activeFrogCall||audio.state!=='running')return false;
  const source=audio.createBufferSource(),gain=audio.createGain();
  source.buffer=frogCallBuffer;gain.gain.value=.8*level;
  source.connect(gain).connect(master);activeFrogCall=source;
  source.onended=()=>{source.disconnect();gain.disconnect();if(activeFrogCall===source)activeFrogCall=null;};
  source.start();return true;
}
const benchSpots=[[12,-1],[29,-1],[48,-1],[67,-1],[84,-1],[21,1],[57,1],[78,1]];
function buildTrailFences(){
  const posts=[],rails=[],dummy=new THREE.Object3D();
  const clear=(a,b,side)=>!benchSpots.some(([d,s])=>s===side&&b>=d-2.25&&a<=d+2.25);
  const point=(d,side)=>new THREE.Vector3(path(d)+side*3.03,trailSurfaceHeight(d,side*3.03),-d);
  for(const side of [-1,1]){
    const used=new Map();
    for(let d=0;d<89;d+=2.2){
      const end=Math.min(89,d+2.2);
      if(!clear(d,end,side))continue;
      const a=point(d,side),b=point(end,side);
      for(const [distance,p] of [[d,a],[end,b]])used.set(distance.toFixed(3),p);
      for(const height of [.19,.335]){
        const start=a.clone().add(new THREE.Vector3(0,height,0));
        const finish=b.clone().add(new THREE.Vector3(0,height,0));
        dummy.position.copy(start).add(finish).multiplyScalar(.5);
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),finish.clone().sub(start).normalize());
        dummy.scale.set(.045,start.distanceTo(finish),.045);dummy.updateMatrix();rails.push(dummy.matrix.clone());
      }
    }
    for(const p of used.values()){
      dummy.position.copy(p).add(new THREE.Vector3(0,.20,0));dummy.rotation.set(0,0,0);
      dummy.scale.set(.065,.40,.065);dummy.updateMatrix();posts.push(dummy.matrix.clone());
    }
  }
  const fence=new THREE.Group();fence.name='trail-wood-fences-with-bench-openings';
  const geometry=new THREE.CylinderGeometry(1,1,1,10);
  for(const [items,color] of [[posts,'#976b45'],[rails,'#b48a5c']]){
    const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.93}),items.length);
    items.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.castShadow=true;mesh.receiveShadow=true;fence.add(mesh);
  }
  scene.add(fence);
}
function buildTrailBenches(){
  const wood=new THREE.MeshStandardMaterial({color:'#a66b3d',roughness:.88});
  const frame=new THREE.MeshStandardMaterial({color:'#66513e',roughness:.94});
  // Reuse all boards, legs and materials across the resting spots.
  const board=new THREE.BoxGeometry(1.8,.085,.135);
  const leg=new THREE.CylinderGeometry(.045,.055,.48,10);
  const rail=new THREE.BoxGeometry(1.52,.07,.07);
  const support=new THREE.BoxGeometry(.075,.78,.075);
  for(const [d,side] of benchSpots){
    const bench=new THREE.Group();bench.name='trail-rest-bench-'+d;
    for(let j=0;j<4;j++){
      mesh(board,wood,bench,0,.50,-.24+j*.16);
    }
    for(let j=0;j<3;j++)mesh(board,wood,bench,0,.73+j*.14,-.34);
    for(const x of [-.70,.70]){
      for(const z of [-.22,.22])mesh(leg,frame,bench,x,.24,z);
      mesh(support,frame,bench,x,.64,-.35);
    }
    for(const z of [-.22,.22])mesh(rail,frame,bench,0,.27,z);
    const offset=side===-1?3.65:3.08;
    const fade=THREE.MathUtils.smoothstep((offset-3.12)/7.5,0,1);
    const wave=1+.40*Math.sin(d*.12+side*.9)+.24*Math.sin(d*.043+side*1.7);
    const gentle=.08*Math.sin(d*.31+offset*.41)+.055*Math.sin(d*.18-offset*.57);
    bench.position.set(path(d)+side*offset,side===1?trailSurfaceHeight(d,offset):.008+fade*Math.max(.08,wave+gentle),-d);
    bench.rotation.y=-side*Math.PI/2;
    bench.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
    scene.add(bench);
  }
}
async function loadTrailAcorns(){
  try{
    const gltf=await new GLTFLoader().loadAsync('./models/autumn_acorn.glb');
    const model=gltf.scene;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    if(!Number.isFinite(size.y)||size.y<=0)throw new Error('Invalid acorn bounds');
    const centre=bounds.getCenter(new THREE.Vector3());
    const pivot=new THREE.Matrix4().makeTranslation(-centre.x,-centre.y,-centre.z);
    let acornSeed=59271;
    const rand=()=>((acornSeed=Math.imul(acornSeed,1664525)+1013904223|0)>>>0)/4294967296;
    const placements=[],dummy=new THREE.Object3D();
    for(const stop of [1.8,9.7,16.4,28.2,35.6,43.8,52.7,61.4,73.9,82.6,89.3]){
      const side=rand()<.5?-1:1,count=6+Math.floor(rand()*5);
      for(let i=0;i<count;i++){
        const d=stop+(rand()-.5)*3.6,off=(rand()<.8?side:-side)*(1.65+rand()*.92);
        const scale=(.11+rand()*.09)/size.y;
        dummy.position.set(path(d)+off,0,-d);dummy.scale.setScalar(scale);
        // Predominantly resting on their sides, with varied tilt and heading.
        dummy.rotation.set(.9+rand()*.65,rand()*Math.PI*2,(rand()-.5)*.7);dummy.updateMatrix();
        const matrix=dummy.matrix.clone().multiply(pivot);
        matrix.elements[13]+=trailSurfaceHeight(d,off)+.002-bounds.clone().applyMatrix4(matrix).min.y;
        placements.push(matrix);
      }
    }
    const acorns=new THREE.Group();acorns.name='fallen-3d-trail-acorns';
    model.traverse(object=>{
      if(!object.isMesh)return;
      const patch=new THREE.InstancedMesh(object.geometry,object.material,placements.length);
      placements.forEach((matrix,i)=>patch.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(matrix,object.matrixWorld)));
      patch.instanceMatrix.needsUpdate=true;patch.computeBoundingSphere();patch.receiveShadow=true;acorns.add(patch);
    });
    scene.add(acorns);
  }catch(error){console.error('도토리 모델을 불러오지 못했어요.',error);}
}
async function loadForestShrubs(){
  try{
    const gltf=await new GLTFLoader().loadAsync('./models/autumn_vegetation_set.glb');
    gltf.scene.updateMatrixWorld(true);
    const species=['Green_Shrub','Golden_Grass','Autumn_Flowering_Shrub'];
    let shrubSeed=31791;
    const rand=()=>((shrubSeed=Math.imul(shrubSeed,1664525)+1013904223|0)>>>0)/4294967296;
    const placements=[[],[],[]];
    for(const centre of [-3,4,12,21,29,38,46,57,64,74,85,97]){
      const count=4+Math.floor(rand()*5);
      for(let j=0;j<count;j++){
        const d=centre+(rand()-.5)*5.4,side=rand()<.58?-1:1;
        const h=.55+rand()*.8,width=h*(.9+rand()*.6);
        const offset=side*((side===1?9.65:3.65)+rand()*5.2);
        if(side===-1&&Math.abs(offset)<5&&[12,29,48,67,84].some(stop=>Math.abs(d-stop)<1.6))continue;
        const inner=side===1?9.3:3.12;
        const fade=THREE.MathUtils.smoothstep((Math.abs(offset)-inner)/(side===1?4.2:7.5),0,1);
        const longWave=1+.40*Math.sin(d*.12+side*.9)+.24*Math.sin(d*.043+side*1.7);
        const gentle=.08*Math.sin(d*.31+Math.abs(offset)*.41)+.055*Math.sin(d*.18-Math.abs(offset)*.57);
        const y=.008+fade*Math.max(.08,longWave+gentle);
        placements[Math.floor(rand()*3)].push({x:path(d)+offset,y:y-.018,d,h,width,angle:rand()*Math.PI});
      }
    }
    const shrubs=new THREE.Group();shrubs.name='mixed-autumn-shrub-clusters';
    placements.forEach((items,kind)=>{
      const source=gltf.scene.getObjectByName(species[kind]);
      if(!source)throw new Error('수풀 모델 누락: '+species[kind]);
      const bounds=new THREE.Box3().setFromObject(source),size=bounds.getSize(new THREE.Vector3());
      const centre=bounds.getCenter(new THREE.Vector3()),radius=Math.hypot(size.x,size.z)/2;
      if(size.y<=0)throw new Error('Invalid vegetation bounds');
      const pivot=new THREE.Matrix4().makeTranslation(-centre.x,-bounds.min.y,-centre.z),dummy=new THREE.Object3D();
      const transforms=items.map(p=>{
        const offset=p.x-path(p.d),clearance=Math.abs(offset)-(offset>0?9.2:2.95);
        const scale=Math.min(p.h/size.y,Math.max(.12,clearance)/Math.max(.01,radius));
        dummy.position.set(p.x,p.y,-p.d);dummy.rotation.set(0,p.angle,0);dummy.scale.setScalar(scale);dummy.updateMatrix();
        return dummy.matrix.clone().multiply(pivot);
      });
      source.traverse(object=>{
        if(!object.isMesh)return;
        const patch=new THREE.InstancedMesh(object.geometry,object.material,items.length);
        transforms.forEach((matrix,i)=>patch.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(matrix,object.matrixWorld)));
        patch.instanceMatrix.needsUpdate=true;patch.computeBoundingSphere();patch.receiveShadow=true;shrubs.add(patch);
      });
    });
    scene.add(shrubs);
  }catch(error){console.error('수풀 GLB를 불러오지 못했어요.',error);}
}
async function loadReedImage(){
  try{
    const texture=await new THREE.TextureLoader().loadAsync('./golden-reeds.png');
    texture.colorSpace=THREE.SRGBColorSpace;
    const geometry=new THREE.PlaneGeometry(1,1,1,8);geometry.translate(0,.5,0);
    const time={value:0};
    const material=new THREE.MeshBasicMaterial({map:texture,alphaTest:.12,
      side:THREE.DoubleSide,toneMapped:false});
    material.onBeforeCompile=shader=>{
      shader.uniforms.reedTime=time;
      shader.vertexShader='uniform float reedTime;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.x += .028 * uv.y * uv.y * sin(reedTime * .7 + instanceMatrix[3].z * .29 + instanceMatrix[3].x * .4);');
    };
    const clumps=240;
    const patch=new THREE.InstancedMesh(geometry,material,clumps*2),dummy=new THREE.Object3D();
    patch.name='golden-reed-image-meadow';
    let meadowSeed=9173;
    const rand=()=>((meadowSeed=Math.imul(meadowSeed,1664525)+1013904223|0)>>>0)/4294967296;
    // Three overlapping, staggered rows on each side keep the walking corridor clear.
    for(let i=0;i<clumps;i++){
      const side=i%2?1:-1,row=Math.floor(i/2)%3,step=Math.floor(i/6);
      const d=65+(step/39)*27+(rand()-.5)*.42;
      const h=1.5+rand()*1.55+row*.17;
      const width=h*texture.image.width/texture.image.height*(.78+rand()*.30);
      const offset=side*Math.max(width*.5+(side===1?9.35:3.05),(side===1?10.45:4.15)+row*1.22+(rand()-.5)*.45);
      dummy.position.set(path(d)+offset,.035,-d);
      dummy.scale.set(width,h,1);
      for(let face=0;face<2;face++){
        dummy.rotation.y=i*2.39996+face*Math.PI/2;
        dummy.updateMatrix();patch.setMatrixAt(i*2+face,dummy.matrix);
      }
    }
    patch.instanceMatrix.needsUpdate=true;patch.computeBoundingSphere();
    patch.boundingSphere.radius+=.15;
    groups.reed.forEach(old=>{old.removeFromParent();const index=targets.indexOf(old);if(index>=0)targets.splice(index,1);});
    scene.add(mark(patch,'reed'));groups.reedWind=time;
  }catch(error){console.error('갈대 이미지를 불러오지 못했어요.',error);}
}
async function buildSkyClouds(){
  try{
    const loader=new GLTFLoader();
    const models=await Promise.all([
      loader.loadAsync('./models/soft_cumulus_cloud.glb'),
      loader.loadAsync('./models/soft_stratocumulus_cloud.glb'),
    ]);
    const templates=models.map(({scene:model})=>{
      const bounds=new THREE.Box3().setFromObject(model);
      const centre=bounds.getCenter(new THREE.Vector3());
      const width=bounds.getSize(new THREE.Vector3()).x;
      model.position.sub(centre).divideScalar(width);
      model.scale.divideScalar(width);
      const group=new THREE.Group();group.add(model);
      return group;
    });
    const clouds=new THREE.Group();clouds.name='glb-sky-clouds';
    const placements=[
      [1,-38,21,36,24,-.12],[0,26,24,53,18,.25],
      [0,-18,30,79,29,.34],[1,38,25,98,36,-.3],
      [1,-55,29,128,42,.14],[0,30,35,144,22,-.14],
      [1,14,26,-39,32,.20],
    ];
    for(const [type,x,y,d,width,angle] of placements){
      const cloud=templates[type].clone();
      cloud.position.set(x,y,-d);
      cloud.rotation.y=angle;
      cloud.scale.setScalar(width);
      clouds.add(cloud);
    }
    scene.add(clouds);groups.clouds=clouds;
  }catch(error){
    console.warn('구름 모델을 불러오지 못해 기본 구름을 표시해요.',error);
    buildFallbackClouds();
  }
}
function buildFallbackClouds(){
  // Soft alpha textures blur only cloud edges, keeping the forest and UI crisp.
  // Fixed world-space cards do not rotate with the camera or either VR eye.
  const clouds=new THREE.Group();clouds.name='soft-sky-clouds';
  const geometry=new THREE.PlaneGeometry(1,1);
  const materials=[];
  for(let variant=0;variant<4;variant++){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const ctx=canvas.getContext('2d');ctx.filter='blur(5px)';
    for(let j=0;j<28;j++){
      const x=83+j/27*346;
      const ridge=Math.sin(j/27*Math.PI);
      const y=155-ridge*(36+12*Math.sin(j*1.7+variant));
      const radius=27+ridge*25+9*Math.sin(j*2.1+variant);
      ctx.save();ctx.translate(x,y);ctx.scale(1.22,.8);
      const gradient=ctx.createRadialGradient(0,0,0,0,0,radius);
      gradient.addColorStop(0,'rgba(255,255,255,.72)');
      gradient.addColorStop(.45,'rgba(255,255,255,.53)');
      gradient.addColorStop(.78,'rgba(244,249,255,.18)');
      gradient.addColorStop(1,'rgba(240,247,255,0)');
      ctx.fillStyle=gradient;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    materials.push(new THREE.MeshBasicMaterial({map:texture,transparent:true,
      depthWrite:false,side:THREE.DoubleSide,toneMapped:false,opacity:.92}));
  }
  const sizes=[.58,1.15,.82,1.6,.7,1.32,.95,1.75,.64,1.08,1.45,.78,1.22,.9];
  for(let i=0;i<sizes.length;i++){
    const d=-28+i*12,side=i%2?1:-1;
    const cloud=new THREE.Mesh(geometry,materials[i%4]);
    cloud.position.set(side*(30+12*Math.sin(i*1.3)),29+(i%4)*3,-d);
    cloud.scale.set(24*sizes[i],12*sizes[i]*(.86+(i%3)*.12),1);
    cloud.lookAt(0,cloud.position.y,-45);
    clouds.add(cloud);
  }
  scene.add(clouds);groups.clouds=clouds;
}
function setup(){
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1));$('app').prepend(renderer.domElement);
  scene=new THREE.Scene();scene.background=new THREE.Color('#b8e2ff');scene.fog=new THREE.FogExp2('#def0fb',.007);
  camera=new THREE.PerspectiveCamera(61,16/9,.08,500);
  const skyLight=new THREE.HemisphereLight('#f4faff','#aa9d7e',2.5);
  scene.add(skyLight);entryLighting.skyLight=skyLight;
  const sun=new THREE.DirectionalLight('#ffe2aa',1.9);sun.position.set(-16,23,8);scene.add(sun);entryLighting.sun=sun;
  const ground=mesh(new THREE.PlaneGeometry(180,335),material('#888447'),scene,0,-.02,22.5);ground.rotation.x=-Math.PI/2;
  buildDistantMountains();
  buildSkyClouds();
  buildRollingTerrain();
  road=strip(-9,110,-2.65,2.65,.018,material('#be8c58'));
  strip(-9,110,-2.91,-2.65,.012,material('#a6884c')).userData.roadShoulder=true;
  strip(-9,110,2.65,2.91,.012,material('#a6884c')).userData.roadShoulder=true;
  strip(1,32,3.12,8.9,.025,material('#b3a582'));
  water=mark(strip(2,31,3.55,8.5,.042,material('#6ca6a0')),'water');
  const rock=new THREE.IcosahedronGeometry(1,0), crown=new THREE.IcosahedronGeometry(1,1);
  const trunk=new THREE.CylinderGeometry(.65,1,1,6),colors=['#ce5433','#e9af39','#ad7343','#dd782e'];
  const species=['maple','ginkgo','brown'];
  const rows=[[],[]];
  const stones=[],bushes=[],grass=[],ripples=[];
  for(let i=0;i<164;i++){
    const d=between(-7,106),side=i%2?1:-1;let off=between(3.7,29);
    if(side===1)off+=6;
    if(d>65&&d<94)off+=6;
    const x=path(d)+side*off,h=between(3.1,6);
    // Retain the seeded sequence for the ground and wildlife.
    for(let k=0;k<9;k++)random();
    rows[i%2].push({x,d,h});
  }
  for(let i=0;i<590;i++){
    const d=between(-5,103),side=i%2?1:-1, off=between(3,20);
    if(side===1&&off>3.15&&off<9.3)continue;
    const x=path(d)+side*off,size=between(.08,.44);
    stones.push([x,size*.23,-d,size,size*.57,size*.8,random(),i%3?'#a19479':'#c5ad86']);
    if(i%4===0)bushes.push([x,size*.8,-d,size*2,size*1.2,size*1.4,random(),'#858341']);
    grass.push([x,size*.8,-d,size*.16,size*1.7,size*.15,random(),'#a4a15a']);
  }
  for(let i=0;i<1500;i++){
    const d=between(-7,100),size=between(.055,.19);
    leaves.push([path(d)+between(-2.56,2.56),.035,-d,size,.013,size*.57,between(0,6.28),colors[i%4]]);
  }
  const outsideEntry=items=>items.filter(item=>-item[2]>15||-item[2]<-9);
  groups.leaf=batch(rock,material('#ffffff'),[]); // Legacy thick litter is replaced along the entire trail.
  batch(rock,material('#ffffff'),outsideEntry(stones));
  batch(new THREE.ConeGeometry(1,1,4),material('#ffffff'),outsideEntry(grass));
  // Fill gaps behind the front row while keeping the river and reed views open.
  for(let i=0;i<34;i++){
    const d=3+i*2.91,side=i%2?1:-1;
    const offset=12+3.8*(1+Math.sin(i*2.39996))+(d>64?4:0);
    const x=path(d)+side*offset,h=4.3+.85*Math.cos(i*1.7);
    rows[i%2].push({x,d,h});
  }
  // Additional staggered woodland rows reuse the three existing GLB species.
  // Leave the creek bank, central walking corridor, and reed views open.
  for(let i=0;i<84;i++){
    const d=-6+i*1.34,side=i%2?1:-1;
    const offset=8.6+5.5*(.5+.5*Math.sin(i*2.39996))+(side===1?6:0)+(d>65?7:0);
    rows[i%2].push({x:path(d)+side*offset,d,h:3.4+2.5*(.5+.5*Math.cos(i*1.618))});
  }
  rows.forEach((row,side)=>{
    row.sort((a,b)=>a.d-b.d);
    row.forEach((tree,i)=>{
      // Keep each group of three mixed and shift the order between groups.
      const key=species[(i+Math.floor(i/3)+side)%species.length];
      trees.push({...tree,key});
    });
  });
  species.forEach(buildBroadleaf);
  loadForestModel('maple','./models/autumn_maple_tree.glb');
  loadForestModel('ginkgo','./models/golden_ginkgo_tree.glb',1.15);
  loadForestModel('brown','./models/reference_autumn_tree.glb');
  for(let i=0;i<18;i++){
    const d=5+i*5.2,side=i%2?1:-1,offset=side===1?13.5+(i%3):6.7+(i%3)*1.3;
    trees.push({x:path(d)+side*offset,d,h:3.5+(i%4)*.55,key:'chestnutTree'});
  }
  loadForestModel('chestnutTree','./models/autumn_chestnut_tree.glb');
  for(let i=0;i<115;i++){
    const d=between(2.6,30.1);ripples.push([path(d)+between(3.85,8.16),.047,-d,between(.04,.13),.006,between(.12,.58),-.07,i%2?'#88b7ad':'#79aea6']);
  }
  waterLines=batch(rock,material('#fff'),ripples.filter(item=>-item[2]>12));
  buildCreekSample();
  groups.creekLife=createCreekLife(scene,path,creekBanks,buildEntryLeaf);
  loadCreekRockImages();
  const limb=material('#765035'),body=material('#674830'),breast=material('#ebaa67'),beak=material('#a2602b'),eye=material('#281c17');
  for(const [d,side] of [[38,-1],[45,1],[53,-1],[60,1]]){
    const x=path(d)+side*(side===1?10.4:3.65);
    // The former geometric trunk/crown is replaced by a full maple or ginkgo GLB.
    // The GLB is grounded at its lowest point: match the perch top to that plane.
    const perchStart=new THREE.Vector3(x,2.08,-d);
    const perchEnd=new THREE.Vector3(x-side*1.90,2.08,-d);
    const branch=mesh(new THREE.CylinderGeometry(.06,.085,1.90,12),
      new THREE.MeshStandardMaterial({color:'#805432',roughness:1}),scene,0,0,0);
    branch.position.copy(perchStart).add(perchEnd).multiplyScalar(.5);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),
      perchEnd.clone().sub(perchStart).normalize());

    const anchor=group(scene,x-side*1.34,2.14,-d);
    const bird=mark(group(anchor,0,0,0),'bird');bird.visible=false;bird.rotation.y=side*.75;
    mesh(crown,body,bird,0,0,0).scale.set(.21,.22,.29);
    mesh(crown,breast,bird,0,-.03,.13).scale.set(.17,.17,.19);
    const head=group(bird,0,.19,.1);
    mesh(crown,body,head,0,0,0).scale.setScalar(.15);
    mesh(crown,eye,head,.095,.035,.104).scale.setScalar(.025);
    mesh(crown,eye,head,-.095,.035,.104).scale.setScalar(.025);
    const bill=mesh(new THREE.ConeGeometry(.048,.14,5),beak,head,0,-.02,.18);bill.rotation.x=Math.PI/2;
    birds.push({anchor,bird,head,treeX:x,d});
  }
  for(let k=0;k<10;k++){
    const g=mark(group(scene,0,0,0),'reed'), stems=[],tips=[];
    for(let i=0;i<70;i++){
      const d=65+k*2.2+between(0,2.2),x=path(d)+(i%2?1:-1)*between(2.85,9),h=between(1.6,2.8);
      stems.push([x,h*.5,-d,.023,h,.023,random(),i%2?'#a79247':'#c3a34e']);
      tips.push([x,h,-d,.063,.22,.063,random(),i%2?'#c99d55':'#e7be73']);
      if(i%5===0)reeds.push({x,d,h});
    }
    batch(trunk,material('#fff'),stems,g);
    const top=group(g,0,0,0);batch(crown,material('#fff'),tips,top);g.userData.top=top;
    (groups.reed??=[]).push(g);
  }
  loadReedImage();
  loadForestShrubs();
  loadTrailAcorns();
  buildTrailBenches();
  buildTrailFences();
  groups.squirrels=createTrailSquirrels(scene,path,trailSurfaceHeight);
  loadCreekFrogs();
  loadTrailChestnuts();
  const clearing=mesh(new THREE.CircleGeometry(6,36),material('#b68d58'),scene,path(94),.011,-94);
  clearing.rotation.x=-Math.PI/2;clearing.scale.y=1.25;
  new ResizeObserver(resizeScene).observe($('app'));
  setupEntryGround();groups.airborneLeaves=buildAirborneLeaves();loadAnimalModels();loadBirdPerchTrees();bindInput();resetView();requestAnimationFrame(frame);
}
function entryLeafOutline(kind){
  const maple=[[0,-.65],[.12,-.36],[.42,-.43],[.35,-.12],[.7,.08],[.46,.19],
    [.57,.48],[.23,.4],[0,.79],[-.23,.4],[-.57,.48],[-.46,.19],[-.7,.08],
    [-.35,-.12],[-.42,-.43],[-.12,-.36]];
  const ginkgo=[[0,-.7],[.08,-.4],[.34,-.15],[.68,.05],[.73,.29],[.54,.5],
    [.25,.64],[.08,.56],[0,.46],[-.08,.56],[-.25,.64],[-.54,.5],[-.73,.29],
    [-.68,.05],[-.34,-.15],[-.08,-.4]];
  const edge=[[.12,-.49],[.34,-.38],[.4,-.22],[.25,-.13],[.46,.02],[.48,.17],
    [.27,.23],[.37,.4],[.31,.55],[.14,.51],[.1,.71]];
  const oak=[[0,-.67],...edge,[0,.77],...[...edge].reverse().map(([x,y])=>[-x,y])];
  return [maple,ginkgo,oak][kind];
}
function buildEntryLeaf(kind){
  const outline=entryLeafOutline(kind),positions=[],uv=[],index=[];
  // Only a few paper-thin leaves supplement the flat texture.
  positions.push(0,0,0);uv.push(.5,.5);
  for(const radius of [.53,1]){
    outline.forEach(([x,z],i)=>{
      positions.push(x,.0018*radius*radius*(1+Math.sin(i*1.8)),z);
      uv.push(x*.6+.5,z*.6+.5);
    });
  }
  const n=outline.length;
  for(let i=0;i<n;i++){
    const a=1+i,b=1+(i+1)%n;
    index.push(0,b,a,a,b,b+n,a,b+n,a+n);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(index);geo.computeVertexNormals();return geo;
}
function buildAirborneLeaves(){
  const material=new THREE.MeshStandardMaterial({side:THREE.DoubleSide,roughness:.92});
  const colors=['#bc6340','#cf8745','#d8ac56','#a96941'];
  const dummy=new THREE.Object3D();
  const smooth=THREE.MathUtils.smoothstep;
  const leavesPerShape=40;
  const patches=Array.from({length:3},(_,kind)=>{
    const mesh=new THREE.InstancedMesh(buildEntryLeaf(kind),material,leavesPerShape);
    mesh.name='breeze-leaves-'+kind;
    mesh.count=0;
    mesh.frustumCulled=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    const leaves=Array.from({length:leavesPerShape},(_,index)=>{
      const id=index*3+kind;
      return {
        distance:-3+id*.84+Math.sin(id*2.39)*1.3,
        origin:null,
        phase:id*.61803399%1,
        duration:12+id%7,

        size:.055+(id%5)*.011,
        color:new THREE.Color(colors[id%colors.length])
      };
    });
    return {mesh,leaves};
  });
  let elapsed=0,assignedCanopies=0;
  return dt=>{
    elapsed+=dt;
    if(!leafCanopies.length)return;
    if(assignedCanopies!==leafCanopies.length){
      assignedCanopies=leafCanopies.length;
      for(const {leaves} of patches)for(const leaf of leaves){
        let bestScore=Infinity;
        for(const origin of leafCanopies){
          const distance=-origin.z;
          const offset=origin.x-path(distance);
          // Prefer trees upwind so leaves reach the path while still airborne.
          const score=Math.abs(distance-leaf.distance)+.7*Math.abs(offset)+(offset>0?12:0);
          if(score<bestScore){bestScore=score;leaf.origin=origin;}
        }
      }
    }
    for(const {mesh,leaves} of patches){
      let count=0;
      for(const leaf of leaves){
        const progress=(elapsed/leaf.duration+leaf.phase)%1;
        const origin=leaf.origin;
        const d=-origin.z+progress*2.6;
        const distance=Math.abs(d-s);
        if(distance>26||distance<1.3)continue;
        const flutter=elapsed*1.5+leaf.phase*6.28;
        const trailX=path(d);
        const downwindX=Math.max(origin.x+.75,trailX+1.7);
        const drift=smooth(progress,0,.82);
        const x=THREE.MathUtils.lerp(origin.x,downwindX,drift)+.25*progress*Math.sin(flutter*.7);
        const y=THREE.MathUtils.lerp(origin.y,.30,progress)+.09*progress*Math.sin(flutter);
        const fade=smooth(progress,0,.10)*(1-smooth(progress,.8,1));
        const visibility=smooth(distance,1.3,2.5)*(1-smooth(distance,20,26));
        dummy.position.set(x,y,-d);
        dummy.rotation.set(.55*Math.sin(flutter),leaf.phase*6.28+progress*1.9,.65*Math.cos(flutter*.8));
        dummy.scale.setScalar(leaf.size*fade*visibility);
        dummy.updateMatrix();
        mesh.setMatrixAt(count,dummy.matrix);
        mesh.setColorAt(count++,leaf.color);
      }
      mesh.count=count;
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  };
}
function trailSurfaceHeight(d,offset){
  // Centimetre-scale ground relief only; the walking camera keeps its fixed height.
  const edge=THREE.MathUtils.smoothstep(Math.abs(offset),.85,2.95);
  const relief=.020+.012*Math.sin(d*3.1+offset*2.7)+.008*Math.cos(d*5.2-offset*4.1);
  return .039+relief+edge*(.055+.035*Math.sin(d*.46)+.018*Math.sin(d*.91+offset*.7));
}
function buildEntryTrail(){
  let localSeed=8251;
  const rand=()=>((localSeed=Math.imul(localSeed,1664525)+1013904223|0)>>>0)/4294967296;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const wave=8*Math.sin(x/512*Math.PI*8+Math.sin(y/512*Math.PI*6))+
      6*Math.cos(y/512*Math.PI*10+x/512*Math.PI*4);
    const grain=(rand()-.5)*18,i=(y*512+x)*4;
    pixels.data[i]=159+wave+grain;pixels.data[i+1]=119+wave*.78+grain;
    pixels.data[i+2]=78+wave*.48+grain*.7;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const litterColors=['#b55b35','#cf823d','#d4a148','#98623d','#ba8c3d','#bf683a'];
  // Draw the litter into one seamless tile. Wrapped copies continue across all four edges.
  for(let i=0;i<690;i++){
    const kind=i%3,outline=entryLeafOutline(kind);
    const x=rand()*512,y=rand()*512,size=11+rand()*11,angle=rand()*Math.PI*2;
    const color=litterColors[Math.floor(rand()*litterColors.length)];
    for(const dx of [-512,0,512])for(const dy of [-512,0,512]){
      ctx.save();ctx.translate(x+dx,y+dy);ctx.rotate(angle);ctx.scale(size,size);
      ctx.beginPath();
      const last=outline[outline.length-1],first=outline[0];
      ctx.moveTo((last[0]+first[0])/2,(last[1]+first[1])/2);
      outline.forEach(([px,py],index)=>{
        const next=outline[(index+1)%outline.length];
        ctx.quadraticCurveTo(px,py,(px+next[0])/2,(py+next[1])/2);
      });
      ctx.closePath();ctx.fillStyle=color;ctx.fill();
      ctx.strokeStyle='#593f2528';ctx.lineWidth=.025;ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-.48);ctx.quadraticCurveTo(.025,.02,0,.51);
      ctx.strokeStyle='#efd1a56b';ctx.lineWidth=.018;ctx.stroke();
      ctx.restore();
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const rear=-180,nearStart=-29,last=139,widthSegments=28;
  const rearSegments=151,nearSegments=1120;
  const positions=[],uv=[],colors=[],indices=[];
  for(let row=0;row<=rearSegments+nearSegments;row++){
    // Use fewer rows in the distant approach from the mountain to the trail entrance.
    const d=row<rearSegments
      ? THREE.MathUtils.lerp(rear,nearStart,row/rearSegments)
      : THREE.MathUtils.lerp(nearStart,last,(row-rearSegments)/nearSegments);
    const fade=1-THREE.MathUtils.smoothstep(d,114,last);
    const widthScale=.62+.38*fade;
    const rim=.13*Math.sin(d*2.3)+.08*Math.cos(d*4.1);
    for(let col=0;col<=widthSegments;col++){
      const u=col/widthSegments,across=(u-.5)*7.1;
      const offset=across*widthScale;
      const x=path(d)+offset+rim*Math.pow(Math.abs(u-.5)*2,3);
      positions.push(x,trailSurfaceHeight(d,offset),-d);uv.push(x/1.8,d/1.8);
      const edgeAlpha=1-THREE.MathUtils.smoothstep(Math.abs(across),2.55,3.55);
      colors.push(1,1,1,edgeAlpha*fade);
      if(row&&col){
        const a=(row-1)*(widthSegments+1)+col-1,b=a+1,c=row*(widthSegments+1)+col-1;
        indices.push(a,b,c,b,c+1,c);
      }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));
  geo.setIndex(indices);geo.computeVertexNormals();
  // Derive a matching leaf-height tile so leaf edges and soil grain catch soft light.
  const bumpCanvas=document.createElement('canvas');bumpCanvas.width=bumpCanvas.height=512;
  const bumpContext=bumpCanvas.getContext('2d'),heightPixels=ctx.getImageData(0,0,512,512);
  for(let i=0;i<heightPixels.data.length;i+=4){
    const value=.299*heightPixels.data[i]+.587*heightPixels.data[i+1]+.114*heightPixels.data[i+2];
    heightPixels.data[i]=heightPixels.data[i+1]=heightPixels.data[i+2]=value;
    heightPixels.data[i+3]=255;
  }
  bumpContext.putImageData(heightPixels,0,0);
  const bumpTexture=new THREE.CanvasTexture(bumpCanvas);
  bumpTexture.wrapS=bumpTexture.wrapT=THREE.RepeatWrapping;
  bumpTexture.anisotropy=texture.anisotropy;
  const soil=new THREE.MeshStandardMaterial({map:texture,bumpMap:bumpTexture,bumpScale:.035,
    roughness:.98,vertexColors:true,transparent:true,depthWrite:false});
  const trail=mesh(geo,soil,scene,0,0,0);trail.receiveShadow=true;
  road.visible=false;
  // Feather the leaf carpet into the forest floor along the full route.
  scene.children.filter(o=>o.userData.roadShoulder).forEach(o=>o.visible=false);
  const palette=['#b85735','#cd753c','#dca447','#97623c','#b38a40','#c36139'];
  for(let kind=0;kind<3;kind++){
    const items=[];
    for(let i=0;i<113;i++){
      const d=-8.9+rand()*118.8;
      const offset=i%4===0?(rand()-.5)*4.4:(i%2?1:-1)*(2.3+rand()*.65);
      const size=.085+rand()*.045;
      items.push([path(d)+offset,trailSurfaceHeight(d,offset)+.002,-d,size,1,size,rand()*Math.PI*2,
        palette[Math.floor(rand()*palette.length)]]);
    }
    const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.96,side:THREE.DoubleSide});
    const leaves=batch(buildEntryLeaf(kind),material,items);
    leaves.receiveShadow=true;
  }
  const pebbles=[],grasses=[];
  for(let i=0;i<1127;i++){
    const d=-8.9+rand()*118.8,side=i%2?1:-1;
    const offset=side*(2.48+rand()*.7),size=.012+rand()*.035;
    pebbles.push([path(d)+offset,trailSurfaceHeight(d,offset)+.004+size*.35,-d,size,size*.65,size*.8,rand()*6.28,
      i%2?'#998774':'#bba38a']);
    if(i%4===0){
      for(let blade=0;blade<3;blade++)grasses.push([path(d)+offset+blade*.025,trailSurfaceHeight(d,offset)+.051,-d,.012,.11+rand()*.09,.013,rand()*6.28,
        i%3?'#8d9459':'#b3a267']);
    }
  }
  batch(new THREE.SphereGeometry(1,7,5),new THREE.MeshStandardMaterial({color:'#fff',roughness:1}),pebbles).receiveShadow=true;
  batch(new THREE.ConeGeometry(1,1,5),new THREE.MeshStandardMaterial({color:'#fff',roughness:1}),grasses);
}
function setupEntryGround(){
  // The original 1672 × 941 image covers 3.2 × 1.80 metres per tile.
  // Mirror wrapping avoids a hard edge where the supplied image repeats.
  const texture=new THREE.TextureLoader().load('autumn-leaf-carpet.png');
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.MirroredRepeatWrapping;
  texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const mat=new THREE.MeshStandardMaterial({map:texture,roughness:1,color:'#eee5d9'});
  entryRoad=strip(10,15,-2.65,2.65,.041,mat);entryRoad.receiveShadow=true;entryRoad.visible=false;
  const sun=entryLighting.sun;
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-15,right:15,top:16,bottom:-16,near:1,far:70});
  sun.shadow.normalBias=.045;sun.shadow.bias=-.0002;
  sun.target.position.set(path(6),0,-6);scene.add(sun.target);
  for(const target of targets){
    if([names.maple,names.ginkgo,names.brown].includes(target.userData.label))target.castShadow=true;
  }
  const uv=entryRoad.geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++){
    const d=entryRoad.geometry.attributes.position.getZ(i)*-1;
    uv.setXY(i,(i%2)*5.3/3.2,d/(3.2*941/1672));
  }
  uv.needsUpdate=true;
  buildEntryTrail();
}
function updateEntryLighting(){
  const weight=1-THREE.MathUtils.smoothstep(s,15,23);
  scene.background.set('#b8e2ff').lerp(new THREE.Color('#c5eaff'),weight);
  scene.fog.color.set('#def0fb');
  scene.fog.density=THREE.MathUtils.lerp(.007,.005,weight);
  entryLighting.skyLight.color.set('#f4faff');
  entryLighting.skyLight.groundColor.set('#aa9d7e');
  entryLighting.skyLight.intensity=THREE.MathUtils.lerp(2.5,2.6,weight);
  entryLighting.sun.color.set('#fff5e6');
  entryLighting.sun.intensity=THREE.MathUtils.lerp(1.7,1.6,weight);
}
let audio,master,waterGain,reedGain,breezeGain,steps,nextStep=0,nextBird=0,muted=false;
function initAudio(){
  if(audio){audio.resume().catch(()=>{});return;}
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  audio=new Audio();loadFrogRecording();master=audio.createGain();master.gain.value=muted?0:.64;master.connect(audio.destination);
  const buffer=audio.createBuffer(1,audio.sampleRate*3,audio.sampleRate);
  const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  function noise(freq,type,dest,loop){
    const src=audio.createBufferSource(),filter=audio.createBiquadFilter();
    src.buffer=buffer;src.loop=loop;filter.type=type;filter.frequency.value=freq;src.connect(filter).connect(dest);return src;
  }
  function ambience(freq,type){
    const gain=audio.createGain();gain.gain.value=0;gain.connect(master);noise(freq,type,gain,true).start();return gain;
  }
  waterGain=ambience(710,'bandpass');reedGain=ambience(950,'lowpass');
  breezeGain=ambience(420,'bandpass');
  steps={bus:audio.createGain(),noise};steps.bus.gain.value=0;steps.bus.connect(master);
  audio.resume().catch(()=>{});
}
function soundFrame(moving){
  if(!audio)return;
  const t=audio.currentTime,walk=mode==='walk';
  breezeGain.gain.setTargetAtTime(walk?(.018+.009*Math.sin(t*.63)):0,t,.45);
  if(!walk&&activeFrogCall){activeFrogCall.stop();activeFrogCall=null;}
  if(walk&&!muted&&t>=nextFrogSound){
    let nearest=null,best=12;
    frogs.forEach((frog,index)=>{
      const distance=Math.hypot(frog.x-path(s),frog.d-s);
      if(distance<best&&t>=frog.nextCall){best=distance;nearest={frog,index};}
    });
    if(nearest&&playFrogCall(clamp(1-best/16,.32,.86))){
      nearest.frog.nextCall=t+10+nearest.index*1.3;nextFrogSound=t+Math.max(5,frogCallBuffer.duration+1);
    }
  }
  const waterLevel=walk?clamp(Math.min((s+1)/8,(37-s)/9),0,1):0;
  const reedLevel=walk?clamp(Math.min((s-61)/7,(91-s)/7),0,1):0;
  waterGain.gain.setTargetAtTime(.16*waterLevel*(.85+.15*Math.sin(t*4)),t,.18);
  reedGain.gain.setTargetAtTime(.075*reedLevel*(.67+.33*Math.sin(t*1.7)),t,.24);
  steps.bus.gain.setTargetAtTime(walk&&moving?1:0,t,.009);
  if(walk&&moving&&t>=nextStep){
    nextStep=t+.56;
    const g=audio.createGain();g.connect(steps.bus);
    const src=steps.noise(1350+Math.random()*650,'bandpass',g,false);
    g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(.36,t+.045);
    g.gain.exponentialRampToValueAtTime(.001,t+.31);
    src.onended=()=>g.disconnect();src.start(t,Math.random()*2,.33);
  }
  if(walk&&s>35&&s<64&&t>=nextBird){
    nextBird=t+5+Math.random()*3;
    for(let i=0;i<3;i++){
      const a=t+i*.18,o=audio.createOscillator(),g=audio.createGain();
      o.frequency.setValueAtTime(1600+i*110,a);o.frequency.exponentialRampToValueAtTime(2680+i*100,a+.05);
      o.frequency.exponentialRampToValueAtTime(1830,a+.105);
      g.gain.setValueAtTime(.001,a);g.gain.linearRampToValueAtTime(.05,a+.026);
      g.gain.exponentialRampToValueAtTime(.001,a+.11);
      o.connect(g).connect(master);o.start(a);o.stop(a+.12);
    }
  }
}
const keys=new Set(),pointers=new Map();
const keyMap={w:'forward',ArrowUp:'forward',s:'back',ArrowDown:'back',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right'};
let drag;
function clearInput(){
  keys.clear();pointers.clear();drag=null;
  document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));
}
function bindInput(){
  function key(e,down){
    const k=keyMap[e.key]||keyMap[e.key.toLowerCase()];
    if(!k)return;
    if(!down){keys.delete(e.code);return;}
    if(mode!=='walk')return;e.preventDefault();keys.add(e.code);
  }
  window.addEventListener('keydown',e=>key(e,true));window.addEventListener('keyup',e=>key(e,false));
  window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();});
  for(const b of document.querySelectorAll('[data-key]')){
    b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);pointers.set(e.pointerId,b.dataset.key);b.classList.add('held');};
    const release=e=>{pointers.delete(e.pointerId);b.classList.toggle('held',[...pointers.values()].includes(b.dataset.key));};
    b.onpointerup=b.onpointercancel=b.onlostpointercapture=release;
    b.onclick=e=>{if(e.detail===0&&mode==='walk'&&!vrMode?.active){
      const k=b.dataset.key;
      if(k==='left'||k==='right')yaw+=k==='left'?.13:-.13;
      else advance((k==='forward'?1:-1)*walkSpeed*.2);
    }};
  }
  const c=renderer.domElement;
  c.onpointerdown=e=>{if(mode!=='walk'||drag)return;c.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,travel:0};};
  c.onpointermove=e=>{
    if(drag?.id!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    drag.x=e.clientX;drag.y=e.clientY;drag.travel+=Math.hypot(dx,dy);
    if(drag.travel>6){drag.dx-=dx*.004;drag.dy-=dy*.003;}
  };
  c.onpointerup=e=>{if(drag?.id!==e.pointerId)return;if(drag.travel<7)observe(e);drag=null;};
  c.onpointercancel=c.onlostpointercapture=e=>{if(drag?.id===e.pointerId)drag=null;};
}
function observe(e){
  if(vrMode?.active)return;
  const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);
  for(const hit of ray.intersectObjects(targets,true)){
    let object=hit.object,label,visible=true;
    while(object&&object!==scene){
      if(!object.visible)visible=false;
      label||=object.userData.label;
      object=object.parent;
    }
    if(!visible)continue;
    if(label){$('notice').textContent=label;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,2600);}
    break;
  }
}
function resetView(){s=0;yaw=0;pitch=-.055;positionCamera();}
function positionCamera(){
  if(vrMode?.active)return;
  camera.position.set(path(s),1.36,-s);
  camera.rotation.order='YXZ';
  camera.rotation.set(pitch,yaw-bend(s),0);
}
function setMode(next){
  clearInput();mode=next;
  groups.squirrels?.reset();
  $('intro').hidden=next!=='intro';$('hud').hidden=next!=='walk';$('finish').hidden=next!=='finish';
  $('notice').hidden=true;
  if(next!=='finish')resetView();
  if(next==='walk'){initAudio();nextBird=0;nextStep=0;}
  if(next==='finish')$('again').focus({preventScroll:true});
}
function advance(delta){
  // Project the player's facing direction onto the trail centreline.
  s=clamp(s+delta*Math.cos(yaw),0,end);
  if(s===end){yaw=0;pitch=-.055;setMode('finish');}
}
let prev=0;
function frame(time){
  const dt=Math.min((time-prev)/1000,.12);prev=time;
  let moving=false;
  if(mode==='walk'&&!vrMode?.active){
    const actions=new Set([...pointers.values()]);
    const codes={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
    keys.forEach(k=>actions.add(codes[k]));
    yaw+=(Number(actions.has('left'))-Number(actions.has('right')))*dt*.69;
    if(drag){
      const dx=clamp(drag.dx,-dt*1.4,dt*1.4),dy=clamp(drag.dy,-dt,dt);
      yaw+=dx;pitch=clamp(pitch+dy,-.43,.34);drag.dx-=dx;drag.dy-=dy;
    }
    const before=s;advance((Number(actions.has('forward'))-Number(actions.has('back')))*dt*walkSpeed);
    moving=s!==before;
    const label=s<33?'졸졸 흐르는 강물':s<65?'짹짹 노래하는 산새':'사각사각 갈대밭';
    if($('zone').textContent!==label)$('zone').textContent=label;
  }
  const t=time/1000;
  groups.creekLife?.update(dt);
  if(mode==='walk')updateCreekFrogs(t);
  if(mode==='walk')groups.airborneLeaves?.(dt);
  groups.bearMixer?.update(dt);
  // Shared frame loop updates independent mixers in both normal and stereo VR modes.
  birds.forEach(entry=>entry.animation?.update(dt));
  if(groups.reedWind)groups.reedWind.value=t;
  else groups.reed.forEach((g,i)=>g.userData.top.position.x=.038*Math.sin(t*1.3+i*.52));
  if(groups.clouds)groups.clouds.position.x+=dt*.32;
  waterLines.position.z=.1*Math.sin(t*.8);
  if(water.material.map)water.material.map.offset.y=t*.035;
  if(groups.creekSample)groups.creekSample.material.uniforms.time.value=t;
  positionCamera();moving=vrMode?.update(dt)||moving;
  if(mode==='walk')groups.squirrels?.update(s,dt);
  updateForestVisibility();updateEntryLighting();soundFrame(moving);
  if(vrMode?.active)vrMode.render();
  else renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
function assetLayer(key,positions,flat=false){
  const texture=textures[key],items=[];
  const geo=new THREE.PlaneGeometry(1,1);
  if(flat)geo.rotateX(-Math.PI/2);
  const mat=new THREE.MeshBasicMaterial({map:texture,alphaTest:.25,side:THREE.DoubleSide});
  for(const [x,y,z,w,h,angle] of positions)items.push([x,y,z,w,flat?1:h,flat?h:1,angle]);
  return batch(geo,mat,items);
}
const layers={};
function dropLayer(key){
  const old=layers[key];if(!old)return;
  old.removeFromParent();old.geometry.dispose();old.material.dispose();
  const i=targets.indexOf(old);if(i>=0)targets.splice(i,1);delete layers[key];
}
function applyAsset(key,url){
  if(key==='start'){$('intro').style.backgroundImage=url?'url("'+url+'")':'';return;}
  if(key==='rami'||key==='bear'){
    $('friend-'+key)?.remove();
    if(url){const image=new Image();image.id='friend-'+key;image.src=url;image.alt=assetNames[key];$('friends').append(image);}return;
  }
  if(!scene)return;
  dropLayer(key);textures[key]?.dispose();delete textures[key];
  if(url){
    const texture=new THREE.TextureLoader().load(url);
    texture.colorSpace=THREE.SRGBColorSpace;textures[key]=texture;
  }
  if(groups[key]?.leaves){
    const {leaves,veins}=groups[key];
    leaves.material.map=textures[key]||veins;
    leaves.material.needsUpdate=true;
  }else if(key==='road'||key==='water'){
    const o=key==='road'?road:water;
    o.material.map=textures[key]||null;o.material.needsUpdate=true;
    o.material.color.set(url?'#ffffff':key==='road'?'#be8c58':'#6ca6a0');
    if(url)textures[key].wrapT=THREE.RepeatWrapping;
  }else if(key==='leaf'){
    groups.leaf.visible=!url;
    if(url)layers[key]=assetLayer(key,leaves.map(([x,,z,w,,,a])=>[x,.039,z,w*2,w,a]),true);
  }else if(key==='bird'){
    return; // Animated GLB birds take precedence over previously saved image overrides.
  }else if(key==='reed'){
    return; // The supplied reed image is managed by the animated meadow.

  }
}
function assetUI(){
  for(const [key,label] of Object.entries(assetNames)){
    if(key==='bird'||key==='reed')continue;
    const row=document.createElement('label'),input=document.createElement('input');
    row.append(label,input);input.type='file';input.accept='image/png,image/jpeg,image/webp,image/avif';$('assetFields').append(row);
    try{const data=localStorage.getItem('rami-trail-'+key);if(data){urls[key]=data;applyAsset(key,data);}}catch{}
    input.onchange=async()=>{
      const file=input.files[0];if(!file)return;
      try{
        const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');
        const scale=Math.min(1,(key==='start'?1280:640)/Math.max(bitmap.width,bitmap.height));
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
        const data=canvas.toDataURL('image/webp',.85);applyAsset(key,data);urls[key]=data;
        try{localStorage.setItem('rami-trail-'+key,data);$('assetStatus').textContent=label+' 그림을 바꿨어요.';}
        catch{$('assetStatus').textContent=label+' 그림을 이번 실행에 적용했어요. 브라우저 저장 공간이 부족해요.';}
      }catch{$('assetStatus').textContent='이 그림을 열 수 없어요. PNG, JPG 또는 WebP를 선택해 주세요.';}
      input.value='';
    };
  }
  $('edit').onclick=()=>$('assets').showModal();
  $('resetAssets').onclick=()=>{
    for(const key of Object.keys(urls)){applyAsset(key,null);delete urls[key];try{localStorage.removeItem('rami-trail-'+key);}catch{}}
    $('assetStatus').textContent='기본 그림으로 돌아왔어요.';
  };
}
try{
  setup();assetUI();
  $('start').onclick=$('again').onclick=()=>setMode('walk');
  $('vr').onclick=openVRSetup;
  $('home').onclick=()=>{setMode('intro');$('start').focus();};
  $('sound').onclick=()=>{
    initAudio();muted=!muted;$('sound').textContent=muted?'소리 꺼짐':'소리 켜짐';
    if(master)master.gain.setTargetAtTime(muted?0:.64,audio.currentTime,.02);
  };
}catch(e){
  $('start').disabled=true;$('vr').disabled=true;$('error').hidden=false;
  $('error').textContent='이 브라우저에서 3D 화면을 열 수 없어요. WebGL을 지원하는 브라우저에서 다시 열어 주세요.';
  console.error(e);
}

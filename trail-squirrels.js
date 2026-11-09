import * as THREE from 'three';

export function createTrailSquirrels(scene,path,surfaceHeight){
  const routes=[[17,22],[36,41],[54,59],[74,79]];
  const shoulder=-2.63;
  const body=new THREE.Group();
  const sphere=new THREE.SphereGeometry(1,12,8);
  const fur=new THREE.MeshStandardMaterial({color:'#ae632e',roughness:.9});
  const tailFur=new THREE.MeshStandardMaterial({color:'#8d4b26',roughness:.93});
  const cream=new THREE.MeshStandardMaterial({color:'#ebc58c',roughness:.92});
  const dark=new THREE.MeshStandardMaterial({color:'#2f1c16',roughness:.8});
  function part(mat,x,y,z,sx,sy,sz){
    const mesh=new THREE.Mesh(sphere,mat);
    mesh.position.set(x,y,z);
    mesh.scale.set(sx,sy,sz);
    body.add(mesh);
    return mesh;
  }
  part(fur,0,.115,.015,.092,.099,.16);
  part(cream,0,.092,-.07,.072,.062,.083);
  part(fur,0,.16,-.13,.088,.086,.086);
  part(cream,0,.127,-.198,.066,.039,.049);
  part(dark,0,.141,-.235,.025,.018,.017);
  const paws=[];
  for(const side of [-1,1]){
    part(fur,side*.052,.227,-.12,.029,.049,.022).rotation.z=-side*.19;
    part(cream,side*.053,.23,-.137,.017,.031,.008).rotation.z=-side*.19;
    part(dark,side*.064,.174,-.178,.016,.019,.014);
    paws.push(part(fur,side*.057,.033,-.102,.026,.037,.042));
    paws.push(part(fur,side*.070,.042,.089,.044,.044,.065));
  }
  const profile=[[.014,0],[.05,.05],[.09,.12],[.102,.185],[.088,.245],[.05,.292],[0,.32]];
  const tailShape=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),12);
  const verts=tailShape.attributes.position;
  for(let i=0;i<verts.count;i++){
    verts.setX(i,verts.getX(i)*.78);
    verts.setZ(i,verts.getZ(i)+.12*Math.sin(Math.PI*verts.getY(i)/.32));
  }
  tailShape.computeVertexNormals();
  const tail=new THREE.Mesh(tailShape,tailFur);
  tail.position.set(0,.062,.112);body.add(tail);
  const squirrel=new THREE.Group();squirrel.name='trail-squirrel';squirrel.add(body);
  squirrel.visible=false;scene.add(squirrel);

  // Low cover at either end lets the squirrel enter and leave behind leaves.
  const cover=new THREE.InstancedMesh(sphere,new THREE.MeshStandardMaterial({roughness:1}),routes.length*8);
  const clumps=[[-.09,.18,-.17,.25,.22,.26,'#858045'],[.06,.20,.14,.24,.26,.26,'#77783c'],
    [-.12,.30,.025,.21,.19,.23,'#a3904f'],[.05,.32,-.11,.18,.18,.20,'#9c8648']];
  const dummy=new THREE.Object3D();let instance=0;
  for(const d of routes.flat()){
    for(const [x,y,z,sx,sy,sz,color] of clumps){
      dummy.position.set(path(d)+shoulder+x,surfaceHeight(d,shoulder)+y,-d+z);
      dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
      cover.setMatrixAt(instance,dummy.matrix);cover.setColorAt(instance++,new THREE.Color(color));
    }
  }
  cover.computeBoundingSphere();scene.add(cover);

  let next=0,elapsed=0,active=false;
  const duration=3.9;
  const offsetAt=u=>shoulder+.38*Math.sin(Math.PI*u);
  return {
    reset(){next=0;elapsed=0;active=false;squirrel.visible=false;},
    update(distance,dt){
      if(!active){
        while(next<routes.length&&distance>routes[next][0]+2)next++;
        if(next>=routes.length||distance<routes[next][0]-8)return;
        active=true;elapsed=0;squirrel.visible=true;
      }
      const [start,end]=routes[next];
      elapsed=Math.min(elapsed+dt,duration);
      const u=elapsed/duration,d=THREE.MathUtils.lerp(start,end,u);
      const offset=offsetAt(u),stride=u*7*Math.PI*2;
      const dx=path(d+.05)-path(d-.05)+(.1/(end-start))*.38*Math.PI*Math.cos(Math.PI*u);
      squirrel.position.set(path(d)+offset,surfaceHeight(d,offset),-d);
      squirrel.rotation.y=-Math.atan2(dx,.1);
      body.position.y=.052*(1-Math.cos(stride))/2;
      body.rotation.x=.075*Math.sin(stride);
      paws.forEach((paw,i)=>paw.rotation.x=.43*Math.sin(stride+(i===0||i===3?0:Math.PI)));
      tail.rotation.x=.13*Math.sin(stride-.8);
      if(elapsed===duration){next++;active=false;squirrel.visible=false;}
    }
  };
}

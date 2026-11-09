import * as THREE from 'three';

export function createCreekLife(scene,path,banks,leafGeometry){
  let seed=43019;
  const rand=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
  const root=new THREE.Group();root.name='creek-life';scene.add(root);
  const dummy=new THREE.Object3D();
  function batch(geo,mat,items){
    const mesh=new THREE.InstancedMesh(geo,mat,items.length);
    items.forEach((p,i)=>{dummy.position.set(...p.position);dummy.scale.set(...p.scale);dummy.rotation.set(0,p.angle||0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(p.color)mesh.setColorAt(i,new THREE.Color(p.color));});
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);return mesh;
  }
  const stones=[],moss=[],ferns=[],litter=[],rings=[];
  for(let i=0;i<130;i++){
    const d=-5+rand()*120,b=banks(d),u=.12+rand()*.76;
    const x=path(d)+b.near+u*(b.far-b.near);
    const emerged=i%4===0,r=.08+rand()*.16,sy=emerged?.12+rand()*.08:.025+rand()*.035;
    const y=emerged?.09:.05;
    stones.push({position:[x,y,-d],scale:[r,sy,r*(.7+rand()*.6)],angle:rand()*6.28,color:['#a5ada9','#b6b9af','#939f9b','#c0b8a6'][i%4]});
    if(emerged){
      moss.push({position:[x,y+sy*.77,-d],scale:[r*.76,sy*.23,r*.65],color:i%2?'#869565':'#8e9b70'});
      if(rings.length<24)rings.push({x,d,r:r*1.38,phase:rand()*6.28});
    }
  }
  const stoneGeo=new THREE.SphereGeometry(1,16,10);
  batch(stoneGeo,new THREE.MeshStandardMaterial({color:'#fff',roughness:.96}),stones).receiveShadow=true;
  batch(stoneGeo,new THREE.MeshStandardMaterial({color:'#fff',roughness:1}),moss);
  // Curved fern fronds with small paired leaflets, all sharing one geometry.
  const shape=new THREE.Shape();shape.moveTo(0,0);
  for(let j=1;j<=9;j++){const t=j/10;shape.lineTo(Math.sin(t*Math.PI)*.13*(j%2?1:.55),t);}
  shape.lineTo(0,1);for(let j=9;j>=1;j--){const t=j/10;shape.lineTo(-Math.sin(t*Math.PI)*.13*(j%2?1:.55),t);}shape.closePath();
  const fernGeo=new THREE.ShapeGeometry(shape);
  const pos=fernGeo.attributes.position;for(let i=0;i<pos.count;i++){const y=pos.getY(i);pos.setZ(i,y*y*.38);}fernGeo.computeVertexNormals();
  for(let i=0;i<110;i++){
    const d=-3+rand()*112,b=banks(d),near=rand()<.5;
    const x=path(d)+(near?b.near-.18:b.far+.23)+(rand()-.5)*.14;
    for(let j=0;j<4;j++){
      const h=.19+rand()*.29;
      ferns.push({position:[x,.09,-d],scale:[.8+rand()*.4,h,h],angle:j*1.57+rand()*.5,color:rand()<.5?'#879b61':'#a4a775'});
    }
    if(i%2===0)litter.push({d,near,size:.08+rand()*.07,angle:rand()*6.28});
  }
  batch(fernGeo,new THREE.MeshStandardMaterial({color:'#fff',roughness:1,side:THREE.DoubleSide}),ferns);
  const leafMats=['#bb7440','#c6a44d','#b65f3e'].map(color=>new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide,transparent:true}));
  for(let kind=0;kind<2;kind++){
    const items=litter.filter((_,i)=>i%2===kind).map((p,i)=>{
      const b=banks(p.d);
      return {position:[path(p.d)+(p.near?b.near-.28:b.far+.27),.092,-p.d],
        scale:[p.size,1,p.size],angle:p.angle,color:['#bb7440','#c6a44d','#b65f3e'][i%3]};
    });
    batch(leafGeometry(kind),new THREE.MeshStandardMaterial({color:'#fff',roughness:1,side:THREE.DoubleSide}),items);
  }
  const ringGeo=new THREE.RingGeometry(.89,1,32);ringGeo.rotateX(-Math.PI/2);
  const ringMat=new THREE.MeshBasicMaterial({color:'#d2e8e8',transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide});
  const ringMesh=batch(ringGeo,ringMat,rings.map(p=>({position:[p.x,.164,-p.d],scale:[p.r,1,p.r*.66]})));
  ringMesh.renderOrder=3;ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const floating=Array.from({length:18},(_,i)=>{
    const mat=leafMats[i%3].clone(),mesh=new THREE.Mesh(leafGeometry(i%2),mat);root.add(mesh);mesh.renderOrder=4;
    return {mesh,mat,start:-18+i/18*166,u:.22+rand()*.56,speed:.09+rand()*.05,size:.075+rand()*.065,phase:rand()*6.28};
  });
  let elapsed=0;
  return {root,floating,update(dt){
    elapsed+=dt;
    rings.forEach((p,i)=>{
      const size=p.r*(1+.035*Math.sin(elapsed*.8+p.phase));
      dummy.position.set(p.x,.164,-p.d);dummy.rotation.set(0,0,0);dummy.scale.set(size,1,size*.66);
      dummy.updateMatrix();ringMesh.setMatrixAt(i,dummy.matrix);
    });ringMesh.instanceMatrix.needsUpdate=true;
    floating.forEach(p=>{
      const d=-18+((p.start+18+elapsed*p.speed)%166),b=banks(d);
      const u=p.u+.018*Math.sin(elapsed*.18+p.phase);
      p.mesh.position.set(path(d)+b.near+u*(b.far-b.near),.165+.001*Math.sin(elapsed*.6+p.phase),-d);
      p.mesh.rotation.y=p.phase+.12*Math.sin(elapsed*.17+p.phase);
      p.mesh.scale.set(p.size,1,p.size);
      p.mat.opacity=THREE.MathUtils.smoothstep(d,-18,-10)*(1-THREE.MathUtils.smoothstep(d,138,148));
    });
  }};
}

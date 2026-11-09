import * as THREE from 'three';

export function createSongbird(gltf,index){
  const model=gltf.scene.clone(true);
  let seed=(index+1)*7919;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
  const clips=Object.fromEntries(gltf.animations.map(clip=>[clip.name,clip]));
  for(const name of ['Stand','Peck','Hop'])if(!clips[name])throw new Error('산새 애니메이션 누락: '+name);
  const feet=model.getObjectByName('Feet');
  if(!feet)throw new Error('산새 발 기준 노드 Feet가 없어요.');
  const mixer=new THREE.AnimationMixer(model);
  const actions=Object.fromEntries(Object.entries(clips).map(([name,clip])=>[name,mixer.clipAction(clip)]));
  actions.Stand.play();mixer.update(0);model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model);
  const footBounds=new THREE.Box3().setFromObject(feet),footCenter=footBounds.getCenter(new THREE.Vector3());
  const scale=.54/bounds.getSize(new THREE.Vector3()).y;
  const wrapper=new THREE.Group(),normalizer=new THREE.Group();
  wrapper.name='animated-songbird-'+index;
  normalizer.position.set(-footCenter.x,-footBounds.min.y,-footCenter.z);
  normalizer.add(model);wrapper.add(normalizer);wrapper.scale.setScalar(scale);
  // The branch radius at this perch is 6.74 cm, with centre y=2.08.
  wrapper.position.y=2.08+.0674-2.14;
  wrapper.rotation.y=[-1.12,.94,-.48,1.57][index%4];
  const head=model.getObjectByName('Head_pivot');
  const rate=.88+random()*.18;
  actions.Stand.time=clips.Stand.duration*random();
  model.traverse(object=>{if(object.isMesh){object.castShadow=false;object.receiveShadow=true;}});
  let state='Stand',wait=1.8+index*1.9+random()*3.4,elapsed=0,clock=random()*20;
  let previous='';
  const transition=name=>{
    const old=actions[state],next=actions[name];
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
    next.setLoop(name==='Stand'?THREE.LoopRepeat:THREE.LoopOnce,name==='Stand'?Infinity:1);
    next.clampWhenFinished=name!=='Stand';next.play();
    old.crossFadeTo(next,.22,false);state=name;elapsed=0;
  };
  return {wrapper,mixer,model,feet,actions,get state(){return state;},update(dt){
    if(!Number.isFinite(dt)||dt<=0)return;
    clock+=dt;elapsed+=dt*rate;
    if(state==='Stand'){
      wait-=dt;
      if(wait<=0){
        const name=previous==='Hop'?'Peck':random()<.48?'Hop':'Peck';
        previous=name;transition(name);
      }
    }else if(elapsed>=clips[state].duration){
      transition('Stand');wait=4+random()*7.5+index*.37;
    }
    mixer.update(dt*rate);
    if(state==='Stand'&&head){
      head.rotation.y+=(index%2?1:-1)*.16*Math.sin(clock*(.33+index*.07));
    }
  }};
}

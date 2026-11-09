import * as THREE from 'three';

const READY_SECONDS=5;

// Travel distance is measured along the existing path, independently of head orientation.
export class VRAutoWalk {
  constructor({scene,camera,path,end,height=1.36,speed=1.6,automatic=true,onProgress}){
    Object.assign(this,{scene,camera,path,end,height,speed,onProgress});
    this.previousParent=camera.parent;
    this.pathRig=new THREE.Group();this.pathRig.name='pathRig';
    this.headingRig=new THREE.Group();this.headingRig.name='headingRig';
    this.headRig=new THREE.Group();this.headRig.name='headRig';
    scene.add(this.pathRig);this.pathRig.add(this.headingRig);this.headingRig.add(this.headRig);
    this.headRig.add(camera);camera.position.set(0,0,0);camera.quaternion.identity();
    this.table=[{s:0,distance:0}];
    let distance=0,previousX=path(0);
    for(let i=1;i<=1200;i++){
      const s=end*i/1200,x=path(s),previousS=this.table[i-1].s;
      distance+=Math.hypot(x-previousX,s-previousS);
      this.table.push({s,distance});previousX=x;
    }
    this.totalDistance=distance;this.distance=0;this.s=0;
    this.velocity=0;this.remainingReady=READY_SECONDS;this.paused=!automatic;this.finished=false;
    this.updatePose(0,true);
  }
  parameterAt(distance){
    let lo=0,hi=this.table.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(this.table[mid].distance<distance)lo=mid;else hi=mid;}
    const a=this.table[lo],b=this.table[hi];
    return THREE.MathUtils.lerp(a.s,b.s,THREE.MathUtils.clamp((distance-a.distance)/(b.distance-a.distance),0,1));
  }
  updatePose(dt,immediate=false){
    this.pathRig.position.set(this.path(this.s),this.height,-this.s);
    const delta=.05;
    const heading=-Math.atan2(this.path(this.s+delta)-this.path(this.s-delta),delta*2);
    const difference=THREE.MathUtils.euclideanModulo(heading-this.headingRig.rotation.y+Math.PI,Math.PI*2)-Math.PI;
    this.headingRig.rotation.y+=difference*(immediate?1:1-Math.exp(-3*dt));
    this.pathRig.updateMatrixWorld(true);
    this.onProgress?.(this.s);
  }
  tick(dt){
    if(this.paused||this.finished)return false;
    if(this.remainingReady>0){this.remainingReady=Math.max(0,this.remainingReady-dt);return false;}
    const remaining=this.totalDistance-this.distance;
    if(remaining<=.002){this.distance=this.totalDistance;this.s=this.end;this.velocity=0;this.finished=true;this.updatePose(dt);return false;}
    // Bound acceleration and deceleration; brake smoothly before the last point.
    const target=Math.min(this.speed,Math.sqrt(2*.32*remaining));
    const change=THREE.MathUtils.clamp(target-this.velocity,-.32*dt,.4*dt);
    const nextVelocity=this.velocity+change;
    const step=Math.min(remaining,(this.velocity+nextVelocity)*.5*dt);
    this.velocity=nextVelocity;this.distance+=step;
    this.s=this.parameterAt(this.distance);this.updatePose(dt);
    if(this.distance>=this.totalDistance){this.s=this.end;this.velocity=0;this.finished=true;this.updatePose(dt);}
    return step>0;
  }
  togglePause(){
    if(this.finished)return;
    this.paused=!this.paused;
    this.velocity=0;
    if(!this.paused)this.remainingReady=READY_SECONDS;
  }
  get status(){
    if(this.finished)return '곰 앞에 도착했어요';
    if(this.paused)return this.distance===0?'제자리에서 둘러봐요':'일시정지 중';
    if(this.remainingReady>0)return Math.ceil(this.remainingReady)+'초 후 출발해요';
    return '천천히 산책하고 있어요';
  }
  dispose(){
    this.camera.removeFromParent();
    if(this.previousParent)this.previousParent.add(this.camera);
    this.pathRig.removeFromParent();
  }
}

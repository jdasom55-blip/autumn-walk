import * as THREE from 'three';
import { StereoEffect } from './vendor/effects/StereoEffect.js';
import { VRAutoWalk } from './vr-walk.js';

export class SmartphoneVR {
  constructor({renderer,scene,camera,app,onEnter,onExit,resize,path,end,onProgress}){
    Object.assign(this,{renderer,scene,camera,app,onEnter,onExit,resize,path,end,onProgress});
    this.active=false;
    this.pending=false;
    this.generation=0;
    this.effect=new StereoEffect(renderer);
    this.effect.setEyeSeparation(.06);
    this.raw=new THREE.Quaternion();
    this.target=new THREE.Quaternion();
    this.offset=new THREE.Quaternion();
    this.screenCorrection=new THREE.Quaternion();
    this.deviceCorrection=new THREE.Quaternion(-Math.SQRT1_2,0,0,Math.SQRT1_2);
    this.euler=new THREE.Euler();
    this.axis=new THREE.Vector3(0,0,1);
    this.up=new THREE.Vector3(0,1,0);
    this.forward=new THREE.Vector3();
    this.sensorReady=false;
    this.needsCenter=true;
    this.sensorHandler=event=>this.readSensor(event);
    this.screenHandler=()=>{this.needsCenter=true;this.showHint();};
    this.fullscreenHandler=()=>{
      if(this.active&&this.ownsFullscreen&&!document.fullscreenElement)this.stop();
    };
    this.keyHandler=e=>{
      if(e.key==='Escape'&&(this.active||this.pending))this.stop();
      if(this.active&&!e.repeat&&[' ','p','P'].includes(e.key)){e.preventDefault();this.togglePause();}
    };
    this.visibilityHandler=event=>{if((event.type==='pagehide'||document.hidden)&&(this.active||this.pending))this.stop();};
    document.getElementById('vrBegin').onclick=()=>this.begin();
    document.getElementById('vrCancel').onclick=()=>this.stop();
    document.getElementById('vrExit').onclick=()=>this.stop();
    document.getElementById('vrCenter').onclick=()=>this.recenter();
    document.getElementById('vrPause').onclick=()=>this.togglePause();
    document.getElementById('vrSetup').addEventListener('cancel',e=>{e.preventDefault();this.stop();});
    this.debug=new URLSearchParams(location.search).get('vrDebug')==='1';
    this.frames=0;this.fpsStarted=performance.now();
  }
  showSetup(){
    this.error('');
    document.getElementById('vrSetup').showModal();
  }
  error(message){
    document.getElementById('vrError').textContent=message;
    document.getElementById('vrBegin').disabled=this.pending;
  }
  async begin(){
    if(this.pending||this.active)return;
    if(!window.isSecureContext){
      this.error('방향 센서는 HTTPS 주소에서 사용할 수 있어요. 웹앱 주소로 다시 열어 주세요.');return;
    }
    if(!window.DeviceOrientationEvent){
      this.error('이 기기나 브라우저에서 방향 센서를 지원하지 않아요. 일반 모드를 이용해 주세요.');return;
    }
    this.pending=true;this.error('방향 센서 연결을 확인하고 있어요.');
    const attempt=++this.generation;
    this.sensorReady=false;this.needsCenter=true;
    this.sample=null;
    this.ownsFullscreen=false;
    this.fullscreenUnavailable=false;
    this.desiredYaw=0;
    window.addEventListener('deviceorientation',this.sensorHandler);
    window.addEventListener('orientationchange',this.screenHandler);
    screen.orientation?.addEventListener('change',this.screenHandler);
    document.addEventListener('keydown',this.keyHandler);
    document.addEventListener('visibilitychange',this.visibilityHandler);
    window.addEventListener('pagehide',this.visibilityHandler);
    try{
      // Both requests originate directly from the user's start-button gesture.
      let permission;
      try{
        permission=typeof DeviceOrientationEvent.requestPermission==='function'
          ? DeviceOrientationEvent.requestPermission()
          : Promise.resolve('granted');
      }catch(error){permission=Promise.reject(error);}
      let obtainedFullscreen=false;
      let unavailableFullscreen=false;
      let fullscreen=Promise.resolve();
      if(!document.fullscreenElement&&this.app.requestFullscreen){
        fullscreen=this.app.requestFullscreen().then(()=>{obtainedFullscreen=true;})
          .catch(()=>{unavailableFullscreen=true;});
      }else if(!document.fullscreenElement)unavailableFullscreen=true;
      const [permissionResult]=await Promise.allSettled([permission,fullscreen]);
      if(attempt!==this.generation){
        if(obtainedFullscreen&&!this.active&&!this.pending&&document.fullscreenElement===this.app)
          document.exitFullscreen?.().catch(()=>{});
        return;
      }
      this.ownsFullscreen=obtainedFullscreen;this.fullscreenUnavailable=unavailableFullscreen;
      if(permissionResult.status==='rejected')throw permissionResult.reason;
      const allowed=permissionResult.value;
      if(allowed!=='granted')throw new Error('센서 권한이 허용되지 않았어요. 브라우저의 동작 및 방향 센서 권한을 확인하거나 일반 모드를 이용해 주세요.');
      try{await screen.orientation?.lock?.('landscape');this.orientationLocked=true;}
      catch{this.orientationLocked=false;}
      if(attempt!==this.generation){this.releaseDisplay();return;}
      if(!this.sensorReady){
        await new Promise((resolve,reject)=>{
          this.sensorResolve=resolve;
          this.sensorReject=reject;
          this.sensorTimer=setTimeout(()=>reject(new Error('방향 센서 값을 받지 못했어요. 기기의 센서 설정을 확인하거나 일반 모드를 이용해 주세요.')),6000);
          if(this.sensorReady)resolve();
        });
      }
      if(attempt!==this.generation)return;
      this.clearSensorWait();
      this.savedPixelRatio=this.renderer.getPixelRatio();
      this.savedShadows=this.renderer.shadowMap.enabled;
      this.onEnter();
      const selectedSpeed=Number(document.getElementById('vrSpeed').value);
      this.walk=new VRAutoWalk({scene:this.scene,camera:this.camera,path:this.path,end:this.end,
        speed:THREE.MathUtils.clamp(Number.isFinite(selectedSpeed)?selectedSpeed:.6,.5,2),
        automatic:document.getElementById('vrAuto').checked,onProgress:this.onProgress});
      this.desiredYaw=0;
      this.centerYaw=this.desiredYaw;
      this.needsCenter=true;
      this.readSensor(this.sample);
      this.walk.headRig.quaternion.copy(this.target);
      this.active=true;this.pending=false;
      this.frames=0;this.fpsStarted=performance.now();
      const resolution=Number(document.getElementById('vrResolution').value);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio,resolution));
      this.renderer.shadowMap.enabled=false;
      this.app.classList.add('vr-active');
      document.getElementById('vrSetup').close();
      document.getElementById('vrEdgeShade').hidden=!document.getElementById('vrDimEdges').checked;
      document.getElementById('vrTools').hidden=false;
      document.getElementById('vrFps').hidden=!this.debug;
      document.addEventListener('fullscreenchange',this.fullscreenHandler);
      this.resize();this.showHint();
    }catch(error){
      if(attempt!==this.generation)return;
      this.pending=false;
      this.detachSensors();
      this.releaseDisplay();
      this.error(error.message||'VR 모드를 시작하지 못했어요. 일반 모드를 이용해 주세요.');
    }
  }
  readSensor(event){
    if(!event||![event.alpha,event.beta,event.gamma].every(Number.isFinite))return;
    this.sample={alpha:event.alpha,beta:event.beta,gamma:event.gamma};
    const r=THREE.MathUtils.degToRad;
    const angle=r(screen.orientation?.angle??window.orientation??0);
    this.euler.set(r(event.beta),r(event.alpha),-r(event.gamma),'YXZ');
    this.raw.setFromEuler(this.euler).multiply(this.deviceCorrection)
      .multiply(this.screenCorrection.setFromAxisAngle(this.axis,-angle));
    if(this.needsCenter){
      this.forward.set(0,0,-1).applyQuaternion(this.raw);
      const heading=Math.atan2(-this.forward.x,-this.forward.z);
      this.offset.setFromAxisAngle(this.up,this.desiredYaw-heading);
      this.needsCenter=false;
    }
    this.target.copy(this.offset).multiply(this.raw);
    this.sensorReady=true;
    this.sensorResolve?.();
  }
  recenter(){
    if(!this.active||!this.sample)return;
    this.desiredYaw=this.centerYaw;this.needsCenter=true;
    this.readSensor(this.sample);
    this.walk.headRig.quaternion.copy(this.target);
  }
  update(dt){
    if(!this.active)return;
    const moving=this.walk.tick(dt);
    this.walk.headRig.quaternion.slerp(this.target,1-Math.exp(-18*dt));
    this.walk.pathRig.updateMatrixWorld(true);
    const status=this.walk.status;
    if(status!==this.lastWalkStatus){
      this.lastWalkStatus=status;
      document.querySelectorAll('.vr-walk-status').forEach(node=>node.textContent=status);
      const pause=document.getElementById('vrPause');
      pause.textContent=this.walk.paused?(this.walk.distance===0?'산책 시작':'산책 재개'):'일시정지';
      pause.disabled=this.walk.finished;
    }
    if(this.debug){
      this.frames++;
      const elapsed=performance.now()-this.fpsStarted;
      if(elapsed>=1000){
        document.getElementById('vrFps').textContent='VR '+Math.round(this.frames*1000/elapsed)+' FPS';
        this.frames=0;this.fpsStarted=performance.now();
      }
    }
    return moving;
  }
  togglePause(){
    if(this.active)this.walk.togglePause();
  }
  render(){
    this.effect.render(this.scene,this.camera);
  }
  showHint(){
    if(!this.active)return;
    const hints=[];
    if(innerWidth<innerHeight)hints.push('스마트폰을 가로로 돌려 주세요.');
    if(this.fullscreenUnavailable)hints.push('전체 화면이 지원되지 않으면 브라우저 메뉴에서 직접 전환해 주세요.');
    document.getElementById('vrHint').textContent=hints.join(' ');
  }
  clearSensorWait(){
    clearTimeout(this.sensorTimer);
    this.sensorResolve=null;this.sensorReject=null;
  }
  detachSensors(){
    this.sensorReject?.(new Error('VR 시작을 취소했어요.'));
    this.clearSensorWait();
    window.removeEventListener('deviceorientation',this.sensorHandler);
    window.removeEventListener('orientationchange',this.screenHandler);
    screen.orientation?.removeEventListener('change',this.screenHandler);
    document.removeEventListener('keydown',this.keyHandler);
    document.removeEventListener('visibilitychange',this.visibilityHandler);
    window.removeEventListener('pagehide',this.visibilityHandler);
    document.removeEventListener('fullscreenchange',this.fullscreenHandler);
  }
  releaseDisplay(){
    if(this.orientationLocked){screen.orientation?.unlock?.();this.orientationLocked=false;}
    if(this.ownsFullscreen&&document.fullscreenElement===this.app)document.exitFullscreen?.().catch(()=>{});
    this.ownsFullscreen=false;
  }
  stop(){
    ++this.generation;
    const wasActive=this.active;
    this.active=false;this.pending=false;
    this.detachSensors();
    this.releaseDisplay();
    this.app.classList.remove('vr-active');
    document.getElementById('vrTools').hidden=true;
    document.getElementById('vrSetup').close();
    if(wasActive){
      this.walk.dispose();this.walk=null;
      this.lastWalkStatus=null;
      this.renderer.setPixelRatio(this.savedPixelRatio);
      this.renderer.shadowMap.enabled=this.savedShadows;
      this.renderer.shadowMap.needsUpdate=true;
      this.renderer.setScissorTest(false);
      this.onExit();
    }
    this.resize();
  }
}

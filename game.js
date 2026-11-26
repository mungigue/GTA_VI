import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const canvas = $('world');
const boot = $('boot');
const loading = $('loading');
const hud = $('hud');
const pauseScreen = $('pause-screen');
const errorScreen = $('error-screen');
const keys = Object.create(null);

let scene, camera, renderer, clock;
let car, player, beacon, beaconRing, oceanWaves = [];
let traffic = [];
let windowsMesh;
const obstacles = []; // Edifici/ostacoli usati dal sistema di collisioni.
let inCar = true, paused = true, started = false;
let velocity = 0, yaw = 0, nitro = 100, missionIndex = 0;
let toastTimer = 0, frameCount = 0;
const worldSize = 250;
const missions = [
  {title:'Un giro sul lungomare', copy:'Raggiungi il punto panoramico sulla costa.', pos:new THREE.Vector3(45,0,-70)},
  {title:'Le luci del centro', copy:'Attraversa il cuore di Vice Coast.', pos:new THREE.Vector3(-72,0,-72)},
  {title:'La strada per il porto', copy:'Scopri il lato industriale della città.', pos:new THREE.Vector3(76,0,65)},
  {title:'La città è tua', copy:'Torna sul boulevard per concludere il giro.', pos:new THREE.Vector3(0,0,0)}
];

function showError(message){
  $('error-message').textContent = message;
  errorScreen.classList.remove('hidden');
}
function makeMat(color, roughness=0.8, metalness=0){
  return new THREE.MeshStandardMaterial({color, roughness, metalness});
}
function addMesh(geometry, material, parent=scene, x=0,y=0,z=0){
  const mesh = new THREE.Mesh(geometry,material);
  mesh.position.set(x,y,z);
  parent.add(mesh);
  return mesh;
}
function addBox(parent, x,y,z, sx,sy,sz, material, cast=false, receive=true){
  const m=addMesh(new THREE.BoxGeometry(sx,sy,sz),material,parent,x,y,z);
  m.castShadow=cast;
  m.receiveShadow=receive;
  return m;
}
function seeded(n){const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);}
// Alias used by the procedural-world generation in the standalone build.
const rand = seeded;

function initRenderer(){
  renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.setSize(window.innerWidth,window.innerHeight,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xd98e7e);
}
function initScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xe5a08b);
  scene.fog=new THREE.FogExp2(0xe5a08b,0.0026);
  camera=new THREE.PerspectiveCamera(62,window.innerWidth/window.innerHeight,0.1,700);
  camera.position.set(0,7,20);
  clock=new THREE.Clock();

  const hemi=new THREE.HemisphereLight(0xffd9c2,0x344b55,2.0);
  scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffc2a3,3.2);
  sun.position.set(-90,115,-65);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-150;sun.shadow.camera.right=150;
  sun.shadow.camera.top=150;sun.shadow.camera.bottom=-150;
  sun.shadow.bias=-0.00025;
  sun.shadow.normalBias=0.03;
  scene.add(sun);
  const fill=new THREE.DirectionalLight(0x70c9d2,0.8);
  fill.position.set(90,30,100);scene.add(fill);
  const sunset=new THREE.PointLight(0xff8d78,90,240,2);
  sunset.position.set(-80,28,-120);scene.add(sunset);
}

function createSkyline(){
  const skyGeo=new THREE.SphereGeometry(500,32,18);
  const skyMat=new THREE.ShaderMaterial({
    side:THREE.BackSide,
    uniforms:{top:{value:new THREE.Color(0x35546c)},horizon:{value:new THREE.Color(0xffb394)}},
    vertexShader:'varying vec3 vWorld; void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:'varying vec3 vWorld;uniform vec3 top;uniform vec3 horizon;void main(){float h=normalize(vWorld).y;float t=smoothstep(-0.18,0.48,h);gl_FragColor=vec4(mix(horizon,top,t),1.0);}'
  });
  scene.add(new THREE.Mesh(skyGeo,skyMat));

  const sunDisc=addMesh(new THREE.CircleGeometry(13,48),new THREE.MeshBasicMaterial({color:0xffd0ad,transparent:true,opacity:0.84,side:THREE.DoubleSide}),scene,-115,62,-190);
  sunDisc.lookAt(camera.position);
  for(let i=0;i<8;i++){
    const cloud=new THREE.Group();
    const cloudMat=new THREE.MeshStandardMaterial({color:0xffc9b5,roughness:1,transparent:true,opacity:0.28});
    const cx=-150+i*43, cy=72+(i%3)*12, cz=-165-(i%2)*34;
    for(let j=0;j<4;j++){
      const puff=addMesh(new THREE.SphereGeometry(8+(j%2)*3,12,8),cloudMat,cloud,(j-1.5)*8,(j%2)*3,0);
      puff.scale.y=0.36;
    }
    cloud.position.set(cx,cy,cz);scene.add(cloud);
  }
}

function createOceanAndBeach(){
  const sand=makeMat(0xd8b99b,0.95);
  addBox(scene,118,-0.45,0,40,0.8,260,sand,false,true);
  const waterMat=new THREE.MeshStandardMaterial({color:0x167b89,roughness:0.23,metalness:0.2});
  const water=addMesh(new THREE.PlaneGeometry(300,380,1,1),waterMat,scene,265,-0.55,0);
  water.rotation.x=-Math.PI/2;
  const foamMat=new THREE.MeshBasicMaterial({color:0xb9e6d9,transparent:true,opacity:0.18});
  for(let i=0;i<9;i++){
    const wave=addMesh(new THREE.PlaneGeometry(90+(i%3)*25,0.32),foamMat,scene,139+i*13,-0.48,-160+(i%4)*95);
    wave.rotation.x=-Math.PI/2;
    wave.rotation.z=(i%2?0.018:-0.018);
    oceanWaves.push(wave);
  }
  const promenade=makeMat(0xe6d7c5,0.9);
  addBox(scene,99,0.02,0,5,0.16,260,promenade,false,true);
  const curb=makeMat(0xf7e6d2,0.85);
  addBox(scene,102,0.08,0,0.35,0.24,260,curb,false,true);
  const railMat=makeMat(0x354d53,0.5,0.55);
  for(let z=-120;z<=120;z+=12){
    addBox(scene,104,0.7,z,0.12,1.4,0.12,railMat,false,false);
  }
  addBox(scene,104,1.35,0,0.12,0.12,260,railMat,false,false);
  const surfMat=new THREE.MeshStandardMaterial({color:0x5fc5bf,roughness:0.45,metalness:0.15});
  for(let i=0;i<7;i++){
    const umbrella=addMesh(new THREE.ConeGeometry(2.3,1.05,8),surfMat,scene,111+(i%3)*4,2,-88+i*28);
    umbrella.position.y=1.8;
    addMesh(new THREE.CylinderGeometry(0.07,0.07,2,8),makeMat(0xead7bb),scene,umbrella.position.x,0.95,umbrella.position.z);
  }
}

function createRoads(){
  const asphalt=makeMat(0x29343b,0.92);
  const sidewalk=makeMat(0xb9a99a,0.95);
  const lineMat=new THREE.MeshBasicMaterial({color:0xe8d7b6});
  const whiteMat=new THREE.MeshBasicMaterial({color:0xd8e1df});
  addBox(scene,0,-0.12,0,245,0.22,245,sidewalk,false,true);

  for(let k=-2;k<=2;k++){
    const p=k*50;
    const width=k===0?15:10;
    const h=addMesh(new THREE.PlaneGeometry(260,width),asphalt,scene,0,0.01,p);h.rotation.x=-Math.PI/2;
    const v=addMesh(new THREE.PlaneGeometry(width,260),asphalt,scene,p,0.012,0);v.rotation.x=-Math.PI/2;
    for(let t=-120;t<=120;t+=12){
      const dash=addMesh(new THREE.PlaneGeometry(4,0.16),lineMat,scene,t,0.025,p);
      dash.rotation.x=-Math.PI/2;
      const mark=addMesh(new THREE.PlaneGeometry(0.16,4),lineMat,scene,p,0.027,t);
      mark.rotation.x=-Math.PI/2;
    }
    for(const side of [-1,1]){
      addMesh(new THREE.PlaneGeometry(260,0.13),whiteMat,scene,0,0.02,p+side*(width/2-0.8)).rotation.x=-Math.PI/2;
      const edge=addMesh(new THREE.PlaneGeometry(0.13,260),whiteMat,scene,p+side*(width/2-0.8),0.022,0);
      edge.rotation.x=-Math.PI/2;
    }
  }
  const cross=makeMat(0xe7e3d9,0.9);
  for(let x=-100;x<=100;x+=50){
    for(let z=-100;z<=100;z+=50){
      for(let j=0;j<6;j++){
        addBox(scene,x-4+j*1.5,0.025,z-8,0.78,0.035,3.6,cross,false,false);
        addBox(scene,x-4+j*1.5,0.025,z+8,0.78,0.035,3.6,cross,false,false);
      }
    }
  }
}

function createPalm(x,z,scale=1){
  const trunkMat=makeMat(0x80624d,0.98);
  const leafMats=[makeMat(0x1c645b,0.83),makeMat(0x2c7967,0.83),makeMat(0x45866b,0.83)];
  const group=new THREE.Group();group.position.set(x,0,z);group.scale.setScalar(scale);scene.add(group);
  const trunk=addMesh(new THREE.CylinderGeometry(0.25,0.52,8,7,4),trunkMat,group,0,4,0);
  trunk.rotation.z=-0.07;
  for(let i=0;i<9;i++){
    const angle=(i/9)*Math.PI*2;
    const length=5.2+(i%3)*0.35;
    const leaf=addMesh(new THREE.ConeGeometry(0.55,length,5,1),leafMats[i%3],group,
      Math.cos(angle)*1.9,7.1+Math.sin(i*2)*0.24,Math.sin(angle)*1.9);
    leaf.rotation.z=-Math.cos(angle)*0.72-0.28;
    leaf.rotation.x=Math.sin(angle)*0.72;
    leaf.rotation.y=angle;
    leaf.scale.set(0.7,1.15,0.45);
  }
  addMesh(new THREE.SphereGeometry(0.68,8,6),makeMat(0x4c6c4c),group,0,7.4,0);
  return group;
}

function createBillboard(parent,text,color){
  const c=document.createElement('canvas');c.width=512;c.height=128;
  const ctx=c.getContext('2d');
  ctx.fillStyle='rgba(12,29,36,.94)';ctx.fillRect(0,0,512,128);
  ctx.strokeStyle='rgba(130,245,226,.9)';ctx.lineWidth=5;ctx.strokeRect(5,5,502,118);
  ctx.fillStyle=color;ctx.font='900 54px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,65);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide});
  const sign=addMesh(new THREE.PlaneGeometry(10,2.5),mat,parent,0,0,0);
  return sign;
}

function createBuildings(){
  const palettes=[0xe7bba2,0xd5c3b1,0x91b6b2,0xc88f98,0xe1d0b8,0x789ba7,0xd6a58f];
  const winMatrices=[];
  const dummy=new THREE.Object3D();
  const windowGeo=new THREE.BoxGeometry(0.95,1.05,0.1);
  const windowMat=new THREE.MeshStandardMaterial({color:0xffd0a2,emissive:0x8a5639,emissiveIntensity:0.7,roughness:0.28,metalness:0.15});
  function windowAt(x,y,z,rot){
    dummy.position.set(x,y,z);dummy.rotation.set(0,rot,0);dummy.scale.set(1,1,1);dummy.updateMatrix();
    winMatrices.push(dummy.matrix.clone());
  }

  let buildingNo=0;
  const blocks=[-75,-25,25,75];
  for(let bi=0;bi<blocks.length;bi++){
    for(let bj=0;bj<blocks.length;bj++){
      const bx=blocks[bi],bz=blocks[bj];
      const count=1+Math.floor(seeded(bi*9+bj*23)*3);
      for(let n=0;n<count;n++){
        const w=13+seeded(buildingNo+2)*8;
        const d=13+seeded(buildingNo+5)*8;
        let h=14+seeded(buildingNo+9)*43;
        if((bi===2&&bj===1)||(bi===1&&bj===2))h+=18;
        const x=bx+(n%2===0?-8:8)+(seeded(buildingNo+12)-0.5)*5;
        const z=bz+(n>1?8:-8)+(seeded(buildingNo+15)-0.5)*5;
        const color=palettes[Math.floor(seeded(buildingNo+18)*palettes.length)];
        const facade=makeMat(color,0.84,0.02);
        const b=addBox(scene,x,h/2,z,w,h,d,facade,true,true);
        obstacles.push({x:x,z:z,hw:w/2,hd:d/2});
        const base=addBox(scene,x,0.55,z,w+0.6,1.1,d+0.6,makeMat(0x6a6964),false,true);
        const roofMat=makeMat(0x53636a,0.8);
        addBox(scene,x,h+0.3,z,w+0.5,0.6,d+0.5,roofMat,false,true);
        if(h>36){
          addBox(scene,x,h+1.25,z,w*0.42,1.5,d*0.45,makeMat(0x9baba7),false,true);
        }
        const floors=Math.floor((h-3)/3.2);
        const cols=Math.max(2,Math.floor(w/2.7));
        for(let f=0;f<floors;f++){
          const wy=2.1+f*3.15;
          for(let c=0;c<cols;c++){
            const wx=x+(c-(cols-1)/2)*(w/(cols+0.2));
            windowAt(wx,wy,z-d/2-0.06,0);
            windowAt(wx,wy,z+d/2+0.06,Math.PI);
          }
          const sideCols=Math.max(2,Math.floor(d/3.2));
          for(let c=0;c<sideCols;c++){
            const wz=z+(c-(sideCols-1)/2)*(d/(sideCols+0.2));
            windowAt(x-w/2-0.06,wy,wz,Math.PI/2);
            windowAt(x+w/2+0.06,wy,wz,-Math.PI/2);
          }
        }
        if(buildingNo%5===1){
          const sign=createBillboard(b,buildingNo%2?'HOTEL CORAL':'PALM CLUB',buildingNo%2?'#8af6e0':'#ffa8bd');
          sign.position.set(0,h*0.24,-d/2-0.09);
        }
        if(buildingNo%3===0){
          addBox(scene,x+w*0.28,h*0.34,z-d/2-0.35,1.4,0.12,0.8,makeMat(0x48565a),false,false);
        }
        buildingNo++;
      }
    }
  }
  windowsMesh=new THREE.InstancedMesh(windowGeo,windowMat,winMatrices.length);
  windowsMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  winMatrices.forEach((m,i)=>windowsMesh.setMatrixAt(i,m));
  windowsMesh.castShadow=false;windowsMesh.receiveShadow=false;
  scene.add(windowsMesh);
}

function createStreetFurniture(){
  const poleMat=makeMat(0x34464a,0.48,0.5);
  const glowMat=new THREE.MeshBasicMaterial({color:0xffe4bd});
  for(let x=-100;x<=100;x+=50){
    for(let z=-100;z<=100;z+=50){
      for(const sx of [-1,1]){
        for(const sz of [-1,1]){
          const px=x+sx*8.5,pz=z+sz*8.5;
          addMesh(new THREE.CylinderGeometry(0.08,0.13,6,7),poleMat,scene,px,3,pz);
          const arm=addBox(scene,px+sx*1.2,5.8,pz,2.4,0.12,0.12,poleMat,false,false);
          addMesh(new THREE.SphereGeometry(0.19,8,6),glowMat,scene,px+sx*2.25,5.6,pz);
        }
      }
    }
  }
  for(let z=-120;z<=120;z+=24){
    createPalm(94,z,0.9);
    if(z%48===0)createPalm(87,z+10,0.72);
  }
  for(let z=-100;z<=100;z+=25){
    createPalm(-110,z,0.8);
    createPalm(110,z+10,0.75);
  }
}

function createCar(color=0xd34c68,scale=1){
  const group=new THREE.Group();group.scale.setScalar(scale);
  const paint=new THREE.MeshStandardMaterial({color,roughness:0.25,metalness:0.68});
  const trim=makeMat(0x10191e,0.4,0.55);
  const glass=new THREE.MeshStandardMaterial({color:0x18323d,roughness:0.12,metalness:0.55});
  const body=addBox(group,0,0.72,0,2.35,0.68,4.45,paint,true,true);body.position.y=0.78;
  const cabin=addBox(group,0,1.35,0.25,1.82,0.78,2.25,glass,true,false);cabin.position.y=1.42;
  addBox(group,0,1.84,0.25,1.88,0.11,2.3,paint,false,false);
  addBox(group,0,0.45,-1.96,2.15,0.19,0.38,trim,false,false);
  addBox(group,0,0.44,1.96,2.15,0.19,0.34,trim,false,false);
  const head=new THREE.MeshBasicMaterial({color:0xffedc9});
  const tail=new THREE.MeshBasicMaterial({color:0xf44763});
  for(const sx of [-1,1]){
    addBox(group,sx*0.78,0.86,-2.24,0.48,0.18,0.04,head,false,false);
    addBox(group,sx*0.78,0.86,2.24,0.48,0.17,0.04,tail,false,false);
    const wheel=addMesh(new THREE.CylinderGeometry(0.46,0.46,0.3,16),trim,group,sx*1.15,0.48,-1.35);
    wheel.rotation.z=Math.PI/2;
    const wheel2=addMesh(new THREE.CylinderGeometry(0.46,0.46,0.3,16),trim,group,sx*1.15,0.48,1.35);
    wheel2.rotation.z=Math.PI/2;
    addMesh(new THREE.CylinderGeometry(0.21,0.21,0.31,12),makeMat(0x8b999a,0.32,0.8),group,sx*1.15,0.48,-1.35).rotation.z=Math.PI/2;
    addMesh(new THREE.CylinderGeometry(0.21,0.21,0.31,12),makeMat(0x8b999a,0.32,0.8),group,sx*1.15,0.48,1.35).rotation.z=Math.PI/2;
  }
  addBox(group,0,0.56,-2.28,1.95,0.08,0.04,trim,false,false);
  addBox(group,0,0.56,2.28,1.95,0.08,0.04,trim,false,false);
  return group;
}

function createPerson(){
  const g=new THREE.Group();
  const clothes=makeMat(0x304d59,0.95),skin=makeMat(0xc98d70,0.92),pants=makeMat(0x202b35,0.95);
  addMesh(new THREE.CapsuleGeometry(0.34,0.72,4,8),clothes,g,0,1.28,0);
  addMesh(new THREE.SphereGeometry(0.27,12,10),skin,g,0,2.06,0);
  for(const sx of [-0.17,0.17]){
    addMesh(new THREE.CylinderGeometry(0.13,0.15,0.78,8),pants,g,sx,0.47,0);
  }
  return g;
}

function createTraffic(){
  const colors=[0xe4c078,0x528e9d,0xe1e0d5,0x5e6770,0x8c5869,0x3b7771];
  for(let i=0;i<8;i++){
    const carAI=createCar(colors[i%colors.length],0.67);
    const lane=(i%2===0?-2.5:2.5);
    const road=-100+Math.floor(i/2)*50;
    carAI.position.set(road+lane,0,-110+(i%4)*55);
    carAI.rotation.y=(i%2===0?0:Math.PI);
    scene.add(carAI);
    traffic.push({mesh:carAI,dir:i%2===0?-1:1,road:road+lane,speed:7+(i%3)*2,axis:'z'});
  }
}

function createBeacon(){
  beacon=new THREE.Group();
  const pos=missions[0].pos;
  beacon.position.set(pos.x,0,pos.z);
  const beamMat=new THREE.MeshBasicMaterial({color:0xff78a4,transparent:true,opacity:0.14,side:THREE.DoubleSide,depthWrite:false});
  const beam=addMesh(new THREE.CylinderGeometry(0.5,5,19,24,1,true),beamMat,beacon,0,9.5,0);
  const ringMat=new THREE.MeshBasicMaterial({color:0xffa1be,transparent:true,opacity:0.9});
  beaconRing=addMesh(new THREE.TorusGeometry(4.2,0.13,8,48),ringMat,beacon,0,0.25,0);
  beaconRing.rotation.x=Math.PI/2;
  addMesh(new THREE.TorusGeometry(2.3,0.08,8,40),ringMat,beacon,0,0.28,0).rotation.x=Math.PI/2;
  scene.add(beacon);
}

function createWorld(){
  createSkyline();
  const ground=addMesh(new THREE.PlaneGeometry(560,560),makeMat(0xc2aa96,1),scene,0,-0.58,0);
  ground.rotation.x=-Math.PI/2;
  createOceanAndBeach();
  createRoads();
  createBuildings();
  createStreetFurniture();
  createTraffic();
  car=createCar(0xd84f72,1);
  car.position.set(0,0,12);
  scene.add(car);
  player=createPerson();
  player.position.set(3,0,12);
  player.visible=false;
  scene.add(player);
  createBeacon();
}

function updateMission(){
  const m=missions[missionIndex];
  $('mission-title').textContent=m.title;
  $('mission-copy').textContent=m.copy;
  $('mission-progress').style.width=(missionIndex/missions.length*100+8)+'%';
  beacon.position.set(m.pos.x,0,m.pos.z);
  showToast('NUOVO OBIETTIVO · '+String(missionIndex+1).padStart(2,'0'));
}

function showToast(text){
  const el=$('toast');el.textContent=text;el.classList.add('show');toastTimer=2.6;
}
function updateDistrict(x,z){
  let name='DOWNTOWN';
  if(x>50&&x<120)name='OCEAN DRIVE';
  else if(x<-50)name='PALM HEIGHTS';
  else if(z<-55)name='ARTS DISTRICT';
  else if(z>55)name='THE PORT';
  $('district').textContent=name;
  $('coords').textContent=(25.7617-z*0.00006).toFixed(4)+'° N · '+(80.1918+x*0.00008).toFixed(4)+'° W';
}

function updateMinimap(x,z){
  const c=$('minimap'),ctx=c.getContext('2d');
  const w=c.width,h=c.height,cx=w/2,cy=h/2;
  ctx.clearRect(0,0,w,h);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,108,0,Math.PI*2);ctx.clip();
  ctx.fillStyle='#102c34';ctx.fillRect(0,0,w,h);
  const scale=0.77;
  ctx.strokeStyle='rgba(202,218,205,.52)';ctx.lineWidth=7;
  for(let k=-2;k<=2;k++){
    ctx.beginPath();ctx.moveTo(cx+(k*50-x)*scale,-20);ctx.lineTo(cx+(k*50-x)*scale,240);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-20,cy+(k*50-z)*scale);ctx.lineTo(240,cy+(k*50-z)*scale);ctx.stroke();
  }
  ctx.fillStyle='#2a9e9b';ctx.fillRect(cx+(110-x)*scale,0,28,220);
  ctx.fillStyle='rgba(255,209,173,.75)';
  for(let i=0;i<20;i++){const px=cx+((i*29)%190-95-x*scale);const pz=cy+((i*47)%190-95-z*scale);ctx.fillRect(px,pz,3,3);}
  const m=missions[missionIndex].pos;
  ctx.fillStyle='#ff83a8';ctx.beginPath();ctx.arc(cx+(m.x-x)*scale,cy+(m.z-z)*scale,5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(255,131,168,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx+(m.x-x)*scale,cy+(m.z-z)*scale,10,0,Math.PI*2);ctx.stroke();
  ctx.translate(cx,cy);ctx.rotate(yaw);
  ctx.fillStyle='#8ffff0';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();
  ctx.restore();
}

function setCamera(dt,target,rotation){
  const offset=new THREE.Vector3(Math.sin(rotation)*10,5.2,Math.cos(rotation)*10);
  if(inCar)offset.multiplyScalar(1);
  else offset.set(0,4.4,8);
  const desired=target.clone().add(offset);
  camera.position.lerp(desired,1-Math.pow(0.001,dt));
  const look=target.clone().add(new THREE.Vector3(0,inCar?1.7:1.3,0));
  camera.lookAt(look);
}

function toggleVehicle(){
  if(inCar){
    inCar=false;player.visible=true;
    player.position.set(car.position.x+2.8,0,car.position.z+1);
    velocity*=0.3;
    $('speed').textContent='000';$('gear').textContent='P';
    $('controls-hint').innerHTML='<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MUOVITI</span><span><kbd>SHIFT</kbd> CORRI</span><span><kbd>E</kbd> GUIDA</span>';
    showToast('SEI SCESO DAL VEICOLO');
  }else{
    if(player.position.distanceTo(car.position)<8){
      inCar=true;player.visible=false;velocity=0;
      $('gear').textContent='D';
      $('controls-hint').innerHTML='<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> GUIDA</span><span><kbd>SHIFT</kbd> TURBO</span><span><kbd>SPACE</kbd> FRENO A MANO</span><span><kbd>E</kbd> SCENDI</span><span><kbd>ESC</kbd> PAUSA</span>';
      showToast('MOTORE ACCESO');
    }else showToast('AVVICINATI AL VEICOLO');
  }
}

function updatePlayer(dt){
  if(inCar){
    const throttle=keys.KeyW?1:0;
    const brake=keys.KeyS?1:0;
    const turbo=keys.ShiftLeft||keys.ShiftRight;
    const handbrake=keys.Space;
    const boost=turbo&&nitro>0&&throttle;
    const maxSpeed=boost?43:31;
    if(throttle)velocity+= (boost?31:19)*dt;
    if(brake)velocity-= (velocity>0?32:13)*dt;
    if(!throttle&&!brake)velocity*=Math.pow(0.982,dt*60);
    if(handbrake)velocity*=Math.pow(0.91,dt*60);
    velocity=THREE.MathUtils.clamp(velocity,-10,maxSpeed);
    const steer=(keys.KeyA?1:0)-(keys.KeyD?1:0);
    yaw+=steer*dt*(0.75+Math.min(Math.abs(velocity)/18,1.7))*(velocity<0?-1:1);
    if(boost)nitro=Math.max(0,nitro-24*dt);else nitro=Math.min(100,nitro+8*dt);
    car.rotation.y=yaw;
    const oldCarX=car.position.x, oldCarZ=car.position.z;
    car.position.x-=Math.sin(yaw)*velocity*dt;
    car.position.z-=Math.cos(yaw)*velocity*dt;
    car.position.x=THREE.MathUtils.clamp(car.position.x,-116,112);
    car.position.z=THREE.MathUtils.clamp(car.position.z,-116,116);
    const carHit=obstacles.some(o=>Math.abs(car.position.x-o.x)<o.hw+1.45&&Math.abs(car.position.z-o.z)<o.hd+2.35);
    if(carHit){car.position.x=oldCarX;car.position.z=oldCarZ;velocity*=-0.22;showToast('ATTENZIONE · OSTACOLO');}
    car.position.y=0;
    const target=car.position.clone();
    setCamera(dt,target,yaw);
    $('speed').textContent=String(Math.round(Math.abs(velocity)*3.6)).padStart(3,'0');
    $('gear').textContent=velocity<-.4?'R':(velocity<.4?'N':'D');
    $('nitro').style.width=nitro+'%';
    updateDistrict(car.position.x,car.position.z);
    const dist=car.position.distanceTo(missions[missionIndex].pos);
    if(dist<12){
      missionIndex=(missionIndex+1)%missions.length;
      updateMission();
    }
    if(!inCar)return;
  }else{
    const forward=(keys.KeyW?1:0)-(keys.KeyS?1:0);
    const side=(keys.KeyD?1:0)-(keys.KeyA?1:0);
    const speed=(keys.ShiftLeft||keys.ShiftRight)?12:7;
    const oldPlayerX=player.position.x, oldPlayerZ=player.position.z;
    const dir=new THREE.Vector3(side,0,-forward);
    if(dir.lengthSq()>0){dir.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),yaw);player.position.addScaledVector(dir,speed*dt);}
    player.position.x=THREE.MathUtils.clamp(player.position.x,-116,112);
    player.position.z=THREE.MathUtils.clamp(player.position.z,-116,116);
    const playerHit=obstacles.some(o=>Math.abs(player.position.x-o.x)<o.hw+0.45&&Math.abs(player.position.z-o.z)<o.hd+0.45);
    if(playerHit){player.position.x=oldPlayerX;player.position.z=oldPlayerZ;}
    player.rotation.y=Math.atan2(dir.x,dir.z)+Math.PI;
    setCamera(dt,player.position.clone(),0);
    updateDistrict(player.position.x,player.position.z);
    if(player.position.distanceTo(missions[missionIndex].pos)<12){
      missionIndex=(missionIndex+1)%missions.length;updateMission();
    }
    $('interaction').classList.toggle('hidden',player.position.distanceTo(car.position)>8);
    $('speed').textContent='---';$('gear').textContent='ON';
    car.position.y=0;
  }
  const pos=inCar?car.position:player.position;
  updateMinimap(pos.x,pos.z);
}

function updateWorld(dt,time){
  if(beacon){
    beacon.children[0].material.opacity=0.1+Math.sin(time*2.3)*0.045;
    beaconRing.rotation.z+=dt*0.7;
    beaconRing.scale.setScalar(1+Math.sin(time*2.5)*0.08);
  }
  oceanWaves.forEach((w,i)=>{w.position.z+=Math.sin(time*0.7+i)*dt*0.7;if(w.position.z>170)w.position.z=-170;});
  traffic.forEach(t=>{
    t.mesh.position.z+=t.dir*t.speed*dt;
    if(t.mesh.position.z>135)t.mesh.position.z=-135;
    if(t.mesh.position.z<-135)t.mesh.position.z=135;
  });
  if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('show');}
}

function animate(){
  requestAnimationFrame(animate);
  if(paused||!renderer)return;
  const dt=Math.min(clock.getDelta(),0.04);
  const time=clock.elapsedTime;
  updatePlayer(dt);
  updateWorld(dt,time);
  renderer.render(scene,camera);
  frameCount++;
}

function resize(){
  if(!renderer||!camera)return;
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.setSize(window.innerWidth,window.innerHeight,false);
}

function startGame(){
  if(started)return;
  started=true;
  boot.classList.add('hidden');
  loading.classList.remove('hidden');
  $('load-progress').style.width='24%';
  try{
    initRenderer();initScene();
    $('load-progress').style.width='52%';
    createWorld();
    $('load-progress').style.width='88%';
    window.addEventListener('resize',resize);
    resize();
    updateMission();
    $('load-progress').style.width='100%';
    setTimeout(()=>{
      loading.classList.add('hidden');hud.classList.remove('hidden');
      paused=false;clock.start();animate();
      showToast('BENVENUTO A VICE COAST');
    },500);
  }catch(err){
    console.error(err);showError('Errore durante la creazione della scena 3D: '+(err&&err.message?err.message:'errore sconosciuto'));
  }
}

function pauseGame(){
  if(!started)return;
  paused=true;pauseScreen.classList.remove('hidden');
}
function resumeGame(){
  pauseScreen.classList.add('hidden');paused=false;clock.getDelta();
}

$('play').addEventListener('click',startGame);
$('pause').addEventListener('click',pauseGame);
$('resume').addEventListener('click',resumeGame);
$('restart').addEventListener('click',()=>location.reload());

window.addEventListener('keydown',(e)=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys[e.code]=true;
  if(e.code==='Escape'&&started){if(paused)resumeGame();else pauseGame();}
  if(e.code==='KeyE'&&started&&!paused&&!e.repeat)toggleVehicle();
});
window.addEventListener('keyup',(e)=>{keys[e.code]=false;});
window.addEventListener('blur',()=>{Object.keys(keys).forEach(k=>keys[k]=false);});

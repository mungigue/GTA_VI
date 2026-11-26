import * as THREE from 'three';
import * as THREE_WEBGPU from 'three/webgpu';
import { WebGPUPathTracer } from 'three-gpu-pathtracer/webgpu/WebGPUPathTracer.js';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

const $ = (id) => document.getElementById(id);
const canvas = $('world');
const boot = $('boot');
const loading = $('loading');
const hud = $('hud');
const pauseScreen = $('pause-screen');
const errorScreen = $('error-screen');
const keys = Object.create(null);

let scene, camera, renderer, clock;
let rayTracer, rayTracingActive = false, rayTracingBuilding = false, rayTracingAvailable = false;
let skyDome, qualityAssetsReady = Promise.resolve();
let adaptivePixelRatio = 1, perfElapsed = 0, perfFrames = 0;
let car, player, beacon, beaconRing, oceanWaves = [];
let traffic = [];
let windowsMesh;
let roadMaterial, environmentTarget, sunLight, oceanSurface;
const obstacles = [];
const wheelRefs = [];
const palmGroups = [];
let inCar = true, paused = true, started = false;
let velocity = 0, yaw = 0, nitro = 100, missionIndex = 0;
let toastTimer = 0, frameCount = 0;
const worldSize = 460;
const missions = [
  {title:'Un giro sul lungomare', copy:'Raggiungi il punto panoramico sulla costa.', pos:new THREE.Vector3(400,0,-200)},
  {title:'Le luci del centro', copy:'Attraversa il cuore di Vice Coast.', pos:new THREE.Vector3(-100,0,-100)},
  {title:'La strada per il porto', copy:'Scopri il lato industriale della città.', pos:new THREE.Vector3(400,0,200)},
  {title:'La città è tua', copy:'Torna sul boulevard per concludere il giro.', pos:new THREE.Vector3(0,0,100)}
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



async function initRenderer(){
  renderer = new THREE_WEBGPU.WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    outputBufferType: THREE.HalfFloatType
  });
  adaptivePixelRatio = Math.min(window.devicePixelRatio || 1, 1.45);
  renderer.setPixelRatio(adaptivePixelRatio);
  renderer.setSize(window.innerWidth,window.innerHeight,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x91a4a8);
  await renderer.init();
  rayTracingAvailable = Boolean(renderer.backend && renderer.backend.isWebGPUBackend);
  renderer.info.autoReset=true;
}
function initScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x91a4a8);
  scene.fog=new THREE.FogExp2(0xa9b9b6,0.00115);
  camera=new THREE.PerspectiveCamera(68,window.innerWidth/window.innerHeight,0.1,1000000);
  camera.position.set(0,9,26);
  clock=new THREE.Clock();

  const hemi=new THREE.HemisphereLight(0xcce8f0,0x3a4544,1.15);
  scene.add(hemi);
  sunLight=new THREE.DirectionalLight(0xffd0a4,3.4);
  sunLight.position.set(-190,220,-150);
  sunLight.castShadow=true;
  sunLight.shadow.mapSize.set(3072,3072);
  sunLight.shadow.camera.left=-520;sunLight.shadow.camera.right=520;
  sunLight.shadow.camera.top=520;sunLight.shadow.camera.bottom=-520;
  sunLight.shadow.camera.near=1;sunLight.shadow.camera.far=900;
  sunLight.shadow.bias=-0.00018;
  sunLight.shadow.normalBias=0.025;
  scene.add(sunLight);
  const fill=new THREE.DirectionalLight(0x91d4df,0.65);
  fill.position.set(180,70,190);scene.add(fill);
  const bounce=new THREE.HemisphereLight(0xf4d8bf,0x47535a,0.35);
  scene.add(bounce);
}

function createSkyline(){
  const sky=new Sky();
  sky.scale.setScalar(650000);
  const uniforms=sky.material.uniforms;
  uniforms['turbidity'].value=8.5;
  uniforms['rayleigh'].value=2.2;
  uniforms['mieCoefficient'].value=0.005;
  uniforms['mieDirectionalG'].value=0.82;
  const sunPosition=new THREE.Vector3();
  sunPosition.setFromSphericalCoords(1,THREE.MathUtils.degToRad(84),THREE.MathUtils.degToRad(228));
  uniforms['sunPosition'].value.copy(sunPosition);
  skyDome=sky;
  scene.add(sky);

  const sunDisc=addMesh(new THREE.SphereGeometry(15,32,24),
    new THREE.MeshBasicMaterial({color:0xffd5b2}),scene,-190,95,-360);
  sunDisc.visible=false;

  const distantMat=new THREE.MeshStandardMaterial({color:0x667a7d,roughness:0.95});
  for(let i=0;i<90;i++){
    const x=-520+i*12;
    const h=22+seeded(i+601)*90;
    const w=7+seeded(i+711)*13;
    const b=addBox(scene,x,h/2,-500-seeded(i+811)*65,w,h,12,distantMat,false,false);
    b.castShadow=false;
  }

  const groundHaze=new THREE.Mesh(
    new THREE.PlaneGeometry(1800,1800),
    new THREE.MeshBasicMaterial({color:0xb5c0b7,transparent:true,opacity:0.045})
  );
  groundHaze.rotation.x=-Math.PI/2;
  groundHaze.position.y=115;
  scene.add(groundHaze);
}

function createOceanAndBeach(){
  const sandMap=makeProceduralSurface(0xd6c2a4,31,'sand');
  const sand= new THREE.MeshStandardMaterial({map:sandMap,roughness:0.98,color:0xe5d2b7});
  addBox(scene,520,-0.48,0,180,0.82,1050,sand,false,true);

  const waterMat=new THREE.MeshPhysicalMaterial({
    color:0x348f99,roughness:0.16,metalness:0.14,clearcoat:1,clearcoatRoughness:0.08,
    envMapIntensity:1.25
  });
  const waterGeo=new THREE.PlaneGeometry(1000,1200,100,120);
  const water=addMesh(waterGeo,waterMat,scene,690,-0.42,0);
  oceanSurface=water;
  water.rotation.x=-Math.PI/2;
  water.userData.basePositions=waterGeo.attributes.position.array.slice();

  const foamMat=new THREE.MeshBasicMaterial({color:0xd4e8df,transparent:true,opacity:0.25,side:THREE.DoubleSide});
  for(let i=0;i<24;i++){
    const wave=addMesh(new THREE.PlaneGeometry(90+(i%4)*25,0.48),foamMat,scene,
      424+(i%4)*18,-0.31,-480+i*42);
    wave.rotation.x=-Math.PI/2;
    wave.rotation.z=(i%2?0.012:-0.012);
    oceanWaves.push(wave);
  }
  const promenadeMat=makeProceduralMaterial(0xc3b7a5,'concrete',17);
  addBox(scene,410,0.015,0,13,0.18,1020,promenadeMat,false,true);
  const curbMat=makeMat(0xd9d0c1,0.78);
  addBox(scene,403,0.12,0,0.42,0.28,1020,curbMat,false,true);
  addBox(scene,417,0.12,0,0.42,0.28,1020,curbMat,false,true);

  const railMat=makeMat(0x4b5656,0.36,0.72);
  for(let z=-490;z<=490;z+=12){
    addBox(scene,401,0.85,z,0.14,1.7,0.14,railMat,false,false);
  }
  addBox(scene,401,1.62,0,0.14,0.14,1020,railMat,false,false);

  const beachGrass=makeProceduralMaterial(0x7b8b68,'grass',23);
  for(let i=0;i<34;i++){
    const x=435+(i%5)*17;
    const z=-470+Math.floor(i/5)*70;
    addBox(scene,x,-0.04,z,8,0.08,36,beachGrass,false,true);
  }

  const beachProps=makeMat(0x367e83,0.55,0.05);
  for(let i=0;i<22;i++){
    const x=455+(i%4)*10;
    const z=-440+i*41;
    const umbrella=addMesh(new THREE.ConeGeometry(2.8,1.2,24),beachProps,scene,x,2.05,z);
    umbrella.rotation.x=Math.PI;
    addMesh(new THREE.CylinderGeometry(0.06,0.06,2.2,10),makeMat(0xe5d8c2),scene,x,0.95,z);
    addBox(scene,x,0.38,z+3,3.2,0.32,1.2,makeMat(0xe4dfd1,0.8),false,true);
  }
}



function createRoads(){
  roadMaterial=new THREE.MeshStandardMaterial({color:0xb1b4b0,roughness:0.92,metalness:0.02});
  const sidewalkMat=makeProceduralMaterial(0xb9b5aa,'concrete',43);
  const curbMat=makeMat(0xd1c9bb,0.9);
  const paint=new THREE.MeshStandardMaterial({color:0xe7dfca,roughness:0.85});
  const yellow=new THREE.MeshStandardMaterial({color:0xe9c36f,roughness:0.8});
  addBox(scene,0,-0.44,0,1020,0.28,1020,makeProceduralMaterial(0x998f7c,'ground',51),false,true);

  const roads=[];
  for(let k=-4;k<=4;k++){
    const p=k*100;
    const major=(k%2===0);
    const width=major?18:13.5;
    const half=width*0.5;
    const sidewalkOffset=half+5.2;
    roads.push({p,width,major});

    const h=addMesh(new THREE.PlaneGeometry(1020,width),roadMaterial,scene,0,-0.25,p);
    h.rotation.x=-Math.PI/2;
    const v=addMesh(new THREE.PlaneGeometry(width,1020),roadMaterial,scene,p,-0.245,0);
    v.rotation.x=-Math.PI/2;

    for(const side of [-1,1]){
      addBox(scene,0,-0.09,p+side*sidewalkOffset,1020,0.28,9.5,sidewalkMat,false,true);
      addBox(scene,p+side*sidewalkOffset,-0.09,0,9.5,0.28,1020,sidewalkMat,false,true);
      addBox(scene,0,0.08,p+side*(half+0.45),1020,0.22,0.3,curbMat,false,true);
      addBox(scene,p+side*(half+0.45),0.08,0,0.3,0.22,1020,curbMat,false,true);
    }

    for(const offset of [-0.42,0.42]){
      const lineH=addMesh(new THREE.PlaneGeometry(1020,0.12),yellow,scene,0,-0.22,p+offset);
      lineH.rotation.x=-Math.PI/2;
      const lineV=addMesh(new THREE.PlaneGeometry(0.12,1020),yellow,scene,p+offset,-0.215,0);
      lineV.rotation.x=-Math.PI/2;
    }
  }

  // Batch all lane dashes into one draw call for the whole city.
  const dashGeo=new THREE.BoxGeometry(4.1,0.035,0.15);
  const dashCount=roads.length*49*4;
  const dashes=new THREE.InstancedMesh(dashGeo,paint,dashCount);
  const dummy=new THREE.Object3D();
  let dashIndex=0;
  for(const road of roads){
    const laneOffset=road.width*0.255;
    for(let t=-480;t<=480;t+=20){
      for(const offset of [-laneOffset,laneOffset]){
        dummy.position.set(t,-0.205,road.p+offset);
        dummy.rotation.set(0,0,0);
        dummy.updateMatrix();
        dashes.setMatrixAt(dashIndex++,dummy.matrix);

        dummy.position.set(road.p+offset,-0.205,t);
        dummy.rotation.set(0,Math.PI/2,0);
        dummy.updateMatrix();
        dashes.setMatrixAt(dashIndex++,dummy.matrix);
      }
    }
  }
  dashes.instanceMatrix.needsUpdate=true;
  dashes.castShadow=false;
  dashes.receiveShadow=false;
  scene.add(dashes);

  // A single instanced crosswalk mesh instead of hundreds of separate objects.
  const stripeGeo=new THREE.BoxGeometry(1.15,0.055,3.4);
  const stripeCount=roads.length*32;
  const stripes=new THREE.InstancedMesh(stripeGeo,paint,stripeCount);
  let stripeIndex=0;
  for(const road of roads){
    const p=road.p;
    const half=road.width*0.5;
    for(const side of [-1,1]){
      const cross=half+2.5;
      for(let j=0;j<8;j++){
        const offset=-half+1.1+j*((road.width-2.2)/7);
        dummy.position.set(p+offset,-0.19,p+side*cross);
        dummy.rotation.set(0,0,0);
        dummy.scale.set(1,1,1);
        dummy.updateMatrix();
        stripes.setMatrixAt(stripeIndex++,dummy.matrix);

        dummy.position.set(p+side*cross,-0.19,p+offset);
        dummy.rotation.set(0,Math.PI/2,0);
        dummy.updateMatrix();
        stripes.setMatrixAt(stripeIndex++,dummy.matrix);
      }
    }
  }
  stripes.instanceMatrix.needsUpdate=true;
  stripes.castShadow=false;
  scene.add(stripes);
}
function createPalm(x,z,scale=1){
  const group=new THREE.Group();group.position.set(x,0,z);group.scale.setScalar(scale);scene.add(group);palmGroups.push(group);
  const bark=makeMat(0x76604c,0.98);
  const trunkCurve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0),new THREE.Vector3(0.12,2.5,0),
    new THREE.Vector3(0.34,5.5,0.04),new THREE.Vector3(0.48,8.2,0.08)
  ]);
  const trunk=addMesh(new THREE.TubeGeometry(trunkCurve,24,0.34,12,false),bark,group);
  trunk.castShadow=true;

  const leafVerts=[],leafIndices=[],branchVerts=[],branchIndices=[];
  const leafMaterial=new THREE.MeshStandardMaterial({color:0x2f7655,roughness:0.91,side:THREE.DoubleSide});
  const branchMaterial=makeMat(0x476c44,0.9);
  function appendTube(targetVerts,targetIndices,geometry){
    const pos=geometry.attributes.position.array,idx=geometry.index.array,offset=targetVerts.length/3;
    for(let j=0;j<pos.length;j++)targetVerts.push(pos[j]);
    for(let j=0;j<idx.length;j++)targetIndices.push(idx[j]+offset);
    geometry.dispose();
  }

  for(let i=0;i<9;i++){
    const angle=(i/9)*Math.PI*2,length=7.4+(i%3)*0.8;
    const start=new THREE.Vector3(0.48,8.15,0.08);
    const end=new THREE.Vector3(Math.cos(angle)*length,5.8+Math.sin(i*2)*0.45,Math.sin(angle)*length);
    const mid=start.clone().lerp(end,0.52);mid.y+=1.1;
    const curve=new THREE.CatmullRomCurve3([start,mid,end]);
    appendTube(branchVerts,branchIndices,new THREE.TubeGeometry(curve,16,0.065,5,false));

    for(let t=0.18;t<0.9;t+=0.07){
      const center=curve.getPoint(t),tangent=curve.getTangent(t).normalize();
      const side=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
      const droop=t*t*1.75;
      for(const sign of [-1,1]){
        const bladeLen=(1.35+Math.sin(t*Math.PI)*0.8)*(0.9+(i%3)*0.12);
        const base=center.clone().addScaledVector(side,sign*0.04);
        const tip=base.clone().addScaledVector(side,sign*bladeLen).add(new THREE.Vector3(0,-droop,0));
        const shoulder=base.clone().lerp(tip,0.48).addScaledVector(tangent,0.23);
        const n=leafVerts.length/3;
        leafVerts.push(base.x,base.y,base.z,shoulder.x,shoulder.y,shoulder.z,tip.x,tip.y,tip.z);
        leafIndices.push(n,n+1,n+2);
      }
    }
  }
  const branchGeo=new THREE.BufferGeometry();
  branchGeo.setAttribute('position',new THREE.Float32BufferAttribute(branchVerts,3));
  branchGeo.setIndex(branchIndices);branchGeo.computeVertexNormals();
  addMesh(branchGeo,branchMaterial,group).castShadow=true;
  const leafGeo=new THREE.BufferGeometry();
  leafGeo.setAttribute('position',new THREE.Float32BufferAttribute(leafVerts,3));
  leafGeo.setIndex(leafIndices);leafGeo.computeVertexNormals();
  addMesh(leafGeo,leafMaterial,group).castShadow=true;
  addMesh(new THREE.SphereGeometry(0.58,14,10),makeMat(0x3e6645,0.92),group,0.46,8.05,0.08);
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


function makeProceduralSurface(baseColor,seed,type){
  const size=512;
  const c=document.createElement('canvas');c.width=size;c.height=size;
  const ctx=c.getContext('2d');
  const rgb=new THREE.Color(baseColor);
  const color='#'+rgb.getHexString();
  ctx.fillStyle=color;ctx.fillRect(0,0,size,size);
  const image=ctx.getImageData(0,0,size,size);
  for(let i=0;i<image.data.length;i+=4){
    const n=(seeded(seed+i*0.00013)-0.5)*(type==='sand'?30:20);
    image.data[i]=THREE.MathUtils.clamp(image.data[i]+n,0,255);
    image.data[i+1]=THREE.MathUtils.clamp(image.data[i+1]+n,0,255);
    image.data[i+2]=THREE.MathUtils.clamp(image.data[i+2]+n,0,255);
  }
  ctx.putImageData(image,0,0);
  for(let i=0;i<2600;i++){
    const x=seeded(seed+i*2.11)*size,y=seeded(seed+i*3.73)*size;
    const r=0.3+seeded(seed+i*5.31)*1.8;
    ctx.fillStyle=type==='sand'?'rgba(93,76,52,0.12)':'rgba(31,42,43,0.09)';
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(type==='ground'?28:(type==='sand'?24:12),type==='ground'?28:(type==='sand'?24:12));
  tex.anisotropy=8;
  return tex;
}
function makeProceduralMaterial(color,type,seed){
  const tex=makeProceduralSurface(color,seed,type);
  return new THREE.MeshStandardMaterial({map:tex,color:0xffffff,roughness:0.94});
}
const facadeTextureCache=new Map();
function createFacadeTexture(seed,baseColor){
  const cacheKey=String(baseColor);
  if(facadeTextureCache.has(cacheKey))return facadeTextureCache.get(cacheKey);
  const c=document.createElement('canvas');c.width=512;c.height=1024;
  const ctx=c.getContext('2d');
  const col=new THREE.Color(baseColor);
  const g=ctx.createLinearGradient(0,0,512,1024);
  g.addColorStop(0,'#'+col.clone().multiplyScalar(1.10).getHexString());
  g.addColorStop(0.52,'#'+col.getHexString());
  g.addColorStop(1,'#'+col.clone().multiplyScalar(0.72).getHexString());
  ctx.fillStyle=g;ctx.fillRect(0,0,512,1024);
  for(let i=0;i<32;i++){
    const x=seeded(seed+i*3.1)*512;
    ctx.fillStyle='rgba(35,43,44,'+(0.025+seeded(seed+i*7.1)*0.045)+')';
    ctx.fillRect(x,0,2+seeded(seed+i)*9,1024);
  }
  const cols=7,rows=13,marginX=25,marginY=25,gapX=13,gapY=13;
  const ww=(512-marginX*2-gapX*(cols-1))/cols;
  const wh=(1024-marginY*2-gapY*(rows-1))/rows;
  for(let row=0;row<rows;row++){
    for(let column=0;column<cols;column++){
      const x=marginX+column*(ww+gapX),y=marginY+row*(wh+gapY);
      const lit=seeded(seed+row*31+column*17)>0.70;
      ctx.fillStyle='rgba(25,35,40,0.65)';ctx.fillRect(x-4,y-4,ww+8,wh+8);
      const glass=ctx.createLinearGradient(x,y,x+ww,y+wh);
      glass.addColorStop(0,lit?'#bd9870':'#263d4c');
      glass.addColorStop(0.24,lit?'#edd0a2':'#506a77');
      glass.addColorStop(0.52,lit?'#8b8574':'#172d3b');
      glass.addColorStop(1,lit?'#d7b98b':'#253d49');
      ctx.fillStyle=glass;ctx.fillRect(x,y,ww,wh);
      ctx.fillStyle='rgba(235,245,236,0.30)';ctx.fillRect(x+4,y+4,ww*0.13,wh-8);
      ctx.fillStyle='rgba(5,14,20,0.55)';ctx.fillRect(x,y+wh-5,ww,5);
      ctx.fillStyle='rgba(180,203,204,0.62)';ctx.fillRect(x-3,y+wh+1,ww+6,3);
      if(row%4===2){
        ctx.fillStyle='rgba(18,29,34,.65)';ctx.fillRect(x-7,y+wh+2,ww+14,7);
        ctx.strokeStyle='rgba(180,194,188,.85)';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(x-5,y+wh+11);ctx.lineTo(x+ww+5,y+wh+11);ctx.stroke();
      }
    }
  }
  // Architectural floor bands and slight weathering at the lower floors.
  for(let y=0;y<1024;y+=79){
    ctx.fillStyle='rgba(239,229,208,0.13)';ctx.fillRect(0,y,512,4);
    ctx.fillStyle='rgba(15,25,30,0.11)';ctx.fillRect(0,y+4,512,2);
  }
  for(let i=0;i<6000;i++){
    const x=seeded(seed+i*1.7)*512,y=seeded(seed+i*5.9)*1024;
    ctx.fillStyle=seeded(seed+i*7.4)>0.5?'rgba(255,255,255,.035)':'rgba(0,0,0,.035)';
    ctx.fillRect(x,y,1+seeded(seed+i)*2,1);
  }
  const tex=new THREE.CanvasTexture(c);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=8;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.magFilter=THREE.LinearFilter;
  facadeTextureCache.set(cacheKey,tex);
  return tex;
}

function createBuildings(){
  const palettes=[0xd1b8a5,0xb9c2bd,0xc2b7a7,0x8da7a9,0xd3c9b8,0xaebbb8,0xc5968b,0x9babb0];
  const blocks=[];
  for(let x=-350;x<=350;x+=100)blocks.push(x);

  // Every palette is batched into one instanced building mesh.
  const buckets=palettes.map(()=>[]);
  const shopWindows=[];
  const roofUnits=[];
  const balconyDecks=[];
  const balconyRails=[];
  let buildingNo=0;

  for(let ix=0;ix<blocks.length;ix++){
    for(let iz=0;iz<blocks.length;iz++){
      const bx=blocks[ix],bz=blocks[iz];
      const count=seeded(ix*19+iz*43)>0.84?2:1;
      for(let n=0;n<count;n++){
        const angle=seeded(buildingNo+22)*Math.PI*2;
        const offset=count===1?0:(n===0?-17:17);
        const x=bx+Math.cos(angle)*offset+(seeded(buildingNo+12)-0.5)*10;
        const z=bz+Math.sin(angle)*offset+(seeded(buildingNo+15)-0.5)*10;
        const w=17+seeded(buildingNo+2)*11;
        const d=17+seeded(buildingNo+5)*10;
        let h=16+seeded(buildingNo+9)*38;
        if((ix===3&&iz===3)||(ix===4&&iz===2))h+=22;
        const paletteIndex=Math.floor(seeded(buildingNo+18)*palettes.length);
        buckets[paletteIndex].push({x,z,w,d,h});
        obstacles.push({x,z,hw:w/2+0.55,hd:d/2+0.55});

        if(buildingNo%3===0){
          shopWindows.push({x,y:2.05,z:z-d/2-0.11,sx:w*0.78,sy:2.65,sz:0.12});
        }
        if(buildingNo%5===0){
          balconyDecks.push({x,y:Math.min(h*0.48,17),z:z-d/2-0.85,sx:w*0.68,sy:0.16,sz:1.35});
          balconyRails.push({x,y:Math.min(h*0.48,17)+0.38,z:z-d/2-1.49,sx:w*0.68,sy:0.55,sz:0.055});
        }
        if(buildingNo%4===0){
          roofUnits.push({x:x-w*0.18,y:h+0.78,z:z-d*0.12,sx:w*0.24,sy:1.35,sz:d*0.22});
        }
        if(buildingNo%11===1){
          const sign=createBillboard(scene,buildingNo%2?'OCEAN HOTEL':'PALM RESIDENCES',buildingNo%2?'#b9fff0':'#ffc3a6');
          sign.position.set(x,Math.min(h-5,14),z-d/2-0.68);
          sign.scale.set(0.85,0.85,1);
        }
        buildingNo++;
      }
    }
  }

  const unitBuilding=new RoundedBoxGeometry(1,1,1,2,0.006);
  const unitBox=new THREE.BoxGeometry(1,1,1);
  const dummy=new THREE.Object3D();
  for(let paletteIndex=0;paletteIndex<palettes.length;paletteIndex++){
    const items=buckets[paletteIndex];
    if(!items.length)continue;
    const texture=createFacadeTexture(paletteIndex+100,palettes[paletteIndex]);
    const wall=new THREE.MeshStandardMaterial({map:texture,roughness:0.79,metalness:0.035});
    const side=new THREE.MeshStandardMaterial({map:texture,roughness:0.82,metalness:0.025,color:0xc3c5bc});
    const roof=makeMat(0x626e6d,0.86,0.12);
    const foundation=makeMat(0x686b66,0.92);
    const materials=[side,side,roof,foundation,wall,wall];
    const batch=new THREE.InstancedMesh(unitBuilding,materials,items.length);
    for(let i=0;i<items.length;i++){
      const b=items[i];
      dummy.position.set(b.x,b.h/2,b.z);
      dummy.rotation.set(0,0,0);
      dummy.scale.set(b.w,b.h,b.d);
      dummy.updateMatrix();
      batch.setMatrixAt(i,dummy.matrix);
    }
    batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    batch.instanceMatrix.needsUpdate=true;
    batch.castShadow=true;
    batch.receiveShadow=true;
    scene.add(batch);
  }

  const shopMat=new THREE.MeshPhysicalMaterial({color:0x203c49,roughness:0.12,metalness:0.52,clearcoat:1,clearcoatRoughness:0.08});
  const shopBatch=new THREE.InstancedMesh(unitBox,shopMat,shopWindows.length);
  shopWindows.forEach((b,i)=>{
    dummy.position.set(b.x,b.y,b.z);
    dummy.rotation.set(0,0,0);
    dummy.scale.set(b.sx,b.sy,b.sz);
    dummy.updateMatrix();
    shopBatch.setMatrixAt(i,dummy.matrix);
  });
  shopBatch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  shopBatch.instanceMatrix.needsUpdate=true;
  shopBatch.castShadow=false;
  scene.add(shopBatch);

  const roofBatch=new THREE.InstancedMesh(unitBox,makeMat(0x76817e,0.75,0.18),roofUnits.length);
  roofUnits.forEach((b,i)=>{
    dummy.position.set(b.x,b.y,b.z);
    dummy.rotation.set(0,seeded(i+15)*Math.PI*2,0);
    dummy.scale.set(b.sx,b.sy,b.sz);
    dummy.updateMatrix();
    roofBatch.setMatrixAt(i,dummy.matrix);
  });
  roofBatch.instanceMatrix.needsUpdate=true;
  scene.add(roofBatch);

  const deckMat=makeMat(0xd0c8b8,0.75);
  const deckBatch=new THREE.InstancedMesh(unitBox,deckMat,balconyDecks.length);
  balconyDecks.forEach((b,i)=>{
    dummy.position.set(b.x,b.y,b.z);dummy.rotation.set(0,0,0);dummy.scale.set(b.sx,b.sy,b.sz);dummy.updateMatrix();
    deckBatch.setMatrixAt(i,dummy.matrix);
  });
  deckBatch.instanceMatrix.needsUpdate=true;
  scene.add(deckBatch);

  const railMat=new THREE.MeshPhysicalMaterial({color:0x9ebfc0,transparent:true,opacity:0.4,roughness:0.2,metalness:0.5});
  const railBatch=new THREE.InstancedMesh(unitBox,railMat,balconyRails.length);
  balconyRails.forEach((b,i)=>{
    dummy.position.set(b.x,b.y,b.z);dummy.rotation.set(0,0,0);dummy.scale.set(b.sx,b.sy,b.sz);dummy.updateMatrix();
    railBatch.setMatrixAt(i,dummy.matrix);
  });
  railBatch.instanceMatrix.needsUpdate=true;
  scene.add(railBatch);
}

function createStreetFurniture(){
  const poleMat=makeMat(0x3c4849,0.38,0.72);
  const lampMat=new THREE.MeshStandardMaterial({color:0xffe2b9,emissive:0xffc98b,emissiveIntensity:2.2,roughness:0.22});
  const positions=[];
  for(let x=-400;x<=400;x+=100)for(let z=-400;z<=400;z+=100)positions.push([x+17,3.7,z-17]);

  const dummy=new THREE.Object3D(),count=positions.length;
  const poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.085,0.13,7.4,12),poleMat,count);
  const arms=new THREE.InstancedMesh(new THREE.BoxGeometry(2.8,0.12,0.16),poleMat,count);
  const bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(0.25,12,10),lampMat,count);
  for(let i=0;i<count;i++){
    const [x,y,z]=positions[i];
    dummy.position.set(x,y,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();poles.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x+1.35,7.15,z);dummy.updateMatrix();arms.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x+2.6,6.85,z);dummy.updateMatrix();bulbs.setMatrixAt(i,dummy.matrix);
  }
  poles.instanceMatrix.needsUpdate=true;arms.instanceMatrix.needsUpdate=true;bulbs.instanceMatrix.needsUpdate=true;
  poles.castShadow=true;scene.add(poles,arms,bulbs);

  for(let x=-400;x<=400;x+=200){
    for(let z=-400;z<=400;z+=200){
      addBox(scene,x+25,0.52,z+20,3.1,0.16,0.72,makeMat(0x806d58,0.86),false,false);
      addBox(scene,x+25,0.25,z+20,2.4,0.55,0.12,makeMat(0x404f50,0.42,0.55),false,false);
      addBox(scene,x+30,0.62,z+20,0.72,1.1,0.72,makeMat(0x53615d,0.55,0.32),false,true);
    }
  }

  for(let z=-455;z<=455;z+=95){
    createPalm(390,z,0.83+(seeded(z+800)*0.18));
  }
  for(let z=-360;z<=360;z+=120){
    createPalm(-390,z,0.74);
  }
}

function createCar(color=0xd34c68,scale=1){
  const group=new THREE.Group();
  group.scale.setScalar(scale);
  const paint=new THREE.MeshPhysicalMaterial({color,roughness:0.19,metalness:0.76,clearcoat:1,clearcoatRoughness:0.08,envMapIntensity:1.35});
  const glass=new THREE.MeshPhysicalMaterial({color:0x142934,roughness:0.12,metalness:0.58,clearcoat:1,clearcoatRoughness:0.04});
  const trim=makeMat(0x11191d,0.42,0.45);
  const chrome=makeMat(0xaeb9b5,0.22,0.85);
  const body=addMesh(new RoundedBoxGeometry(2.05,0.55,4.62,6,0.15),paint,group,0,0.66,0);
  body.castShadow=true;body.receiveShadow=true;
  addMesh(new RoundedBoxGeometry(1.75,0.72,2.42,6,0.13),glass,group,0,1.21,0.1);
  addMesh(new RoundedBoxGeometry(1.58,0.12,2.1,4,0.07),paint,group,0,1.59,0.1);
  addMesh(new RoundedBoxGeometry(1.94,0.16,0.34,4,0.06),trim,group,0,0.42,-2.25);
  addMesh(new RoundedBoxGeometry(1.94,0.16,0.34,4,0.06),trim,group,0,0.42,2.25);
  addBox(group,0,0.78,-2.34,1.72,0.055,0.04,chrome,false,false);
  addBox(group,0,0.78,2.34,1.72,0.055,0.04,chrome,false,false);

  const windowMat=new THREE.MeshPhysicalMaterial({color:0x1c3542,roughness:0.1,metalness:0.48,clearcoat:1});
  for(const side of [-1,1]){
    addBox(group,side*0.87,1.22,0.1,0.035,0.55,2.05,paint,false,false);
    addBox(group,side*0.885,1.25,-0.63,0.035,0.44,0.74,windowMat,false,false);
    addBox(group,side*0.885,1.25,0.72,0.035,0.44,0.72,windowMat,false,false);
    addBox(group,side*0.94,0.62,0,0.07,0.12,2.35,trim,false,false);
    addMesh(new THREE.SphereGeometry(0.10,12,10),paint,group,side*0.99,1.17,-0.79);
    addBox(group,side*1.06,1.16,-0.79,0.32,0.09,0.15,glass,false,false);
  }

  const tireMat=new THREE.MeshStandardMaterial({color:0x101315,roughness:0.97});
  const rimMat=new THREE.MeshStandardMaterial({color:0x9eaaa9,roughness:0.25,metalness:0.9});
  const darkRim=makeMat(0x303a3e,0.3,0.82);
  for(const side of [-1,1]){
    for(const z of [-1.42,1.42]){
      const wheelGroup=new THREE.Group();
      wheelGroup.position.set(side*0.99,0.37,z);
      group.add(wheelGroup);
      const tire=addMesh(new THREE.CylinderGeometry(0.36,0.36,0.27,32,1),tireMat,wheelGroup);
      tire.rotation.z=Math.PI/2;
      const outer=addMesh(new THREE.CylinderGeometry(0.255,0.255,0.29,32,1),rimMat,wheelGroup);
      outer.rotation.z=Math.PI/2;
      const hub=addMesh(new THREE.CylinderGeometry(0.095,0.095,0.3,20),chrome,wheelGroup);
      hub.rotation.z=Math.PI/2;
      for(let spoke=0;spoke<10;spoke++){
        const a=spoke/10*Math.PI*2;
        const bar=addBox(wheelGroup,0,0,0,0.05,0.05,0.23,chrome,false,false);
        bar.position.set(side*0.15,Math.sin(a)*0.15,Math.cos(a)*0.15);
        bar.rotation.x=a;
      }
      addMesh(new THREE.TorusGeometry(0.31,0.022,6,36),darkRim,wheelGroup,side*0.15,0,0);
      addBox(wheelGroup,side*0.08,0.04,-0.1,0.07,0.22,0.1,makeMat(0x9a3037,0.48,0.15),false,false);
      wheelRefs.push(wheelGroup);
    }
  }

  const headMat=new THREE.MeshPhysicalMaterial({color:0xfff3d9,emissive:0xffdba8,emissiveIntensity:1.1,roughness:0.1,metalness:0.15});
  const tailMat=new THREE.MeshStandardMaterial({color:0x9b142a,emissive:0xff183d,emissiveIntensity:1.25,roughness:0.25});
  for(const side of [-1,1]){
    addMesh(new RoundedBoxGeometry(0.46,0.14,0.1,4,0.03),headMat,group,side*0.68,0.79,-2.34);
    addMesh(new RoundedBoxGeometry(0.5,0.15,0.08,4,0.03),tailMat,group,side*0.68,0.79,2.34);
  }
  group.userData.wheels=wheelRefs.slice(-4);
  return group;
}
function createPerson(){
  const g=new THREE.Group();
  const clothes=new THREE.MeshStandardMaterial({color:0x334c58,roughness:0.92});
  const skin=new THREE.MeshStandardMaterial({color:0xb98267,roughness:0.94});
  const pants=makeMat(0x242e36,0.95);
  const shoes=makeMat(0x161b1d,0.9);
  addMesh(new THREE.CapsuleGeometry(0.31,0.78,7,12),clothes,g,0,1.28,0);
  addMesh(new THREE.SphereGeometry(0.245,18,16),skin,g,0,2.08,0);
  addMesh(new THREE.SphereGeometry(0.25,16,12),makeMat(0x17252b,0.94),g,0,2.19,-0.02);
  for(const sx of [-0.17,0.17]){
    addMesh(new THREE.CapsuleGeometry(0.13,0.6,5,10),pants,g,sx,0.48,0);
    addMesh(new THREE.BoxGeometry(0.28,0.14,0.45),shoes,g,sx,0.1,-0.1);
  }
  for(const sx of [-1,1]){
    const arm=addMesh(new THREE.CapsuleGeometry(0.09,0.57,5,10),clothes,g,sx*0.38,1.26,0);
    arm.rotation.z=sx*0.12;
    addMesh(new THREE.SphereGeometry(0.09,10,8),skin,g,sx*0.39,0.88,0);
  }
  return g;
}


function createTraffic(){
  const colors=[0xc7c9c2,0x334d62,0x8f343e,0x9e9b8b,0x283d3b,0x777b7d,0x496a76,0x9b7347];
  const roads=[-300,-200,-100,0,100,200,300];
  for(let i=0;i<10;i++){
    const ai=createCar(colors[i%colors.length],0.88);
    const road=roads[i%roads.length];
    const dir=i%2===0?-1:1;
    const lane=(i%3===0?-3.2:3.2);
    ai.position.set(road+lane,0,-420+((i*91)%840));
    ai.rotation.y=dir<0?0:Math.PI;
    scene.add(ai);
    traffic.push({mesh:ai,dir,speed:9+(i%4)*2.1,axis:'z'});
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
  const ground=addMesh(new THREE.PlaneGeometry(1250,1250),makeProceduralMaterial(0x9c9886,'ground',51),scene,0,-0.58,0);
  ground.rotation.x=-Math.PI/2;
  createOceanAndBeach();
  createRoads();
  createBuildings();
  createStreetFurniture();
  createTraffic();
  car=createCar(0x1f465e,1);
  car.position.set(0,0,18);
  scene.add(car);
  player=createPerson();
  player.position.set(3,0,18);
  player.visible=false;
  scene.add(player);
  createBeacon();
  qualityAssetsReady=loadRealisticAssets();
}

function prepareVehicleModel(source,dimensions={width:2.05,height:1.25,length:4.63}){
  const model=source.clone(true);
  model.updateMatrixWorld(true);
  let bounds=new THREE.Box3().setFromObject(model);
  let size=bounds.getSize(new THREE.Vector3());

  // Models from the library are authored with their nose on +X or +Z.
  // Our driving code uses -Z as forward, so rotate to that convention explicitly.
  model.rotation.y=size.x>size.z?-Math.PI/2:Math.PI;
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  size=bounds.getSize(new THREE.Vector3());

  // Keep every car in real-world metres: supercar 4.63 x 2.09 x 1.19 m,
  // sedan 4.55 x 1.95 x 1.48 m. This prevents a model changing scale by import.
  model.scale.set(
    dimensions.width/Math.max(size.x,0.001),
    dimensions.height/Math.max(size.y,0.001),
    dimensions.length/Math.max(size.z,0.001)
  );
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  model.position.x-=(bounds.min.x+bounds.max.x)*0.5;
  model.position.z-=(bounds.min.z+bounds.max.z)*0.5;
  model.position.y-=bounds.min.y;
  model.updateMatrixWorld(true);
  model.traverse((obj)=>{
    if(obj.isMesh){
      obj.castShadow=true;
      obj.receiveShadow=true;
      if(Array.isArray(obj.material))obj.material.forEach(m=>{if(m){m.envMapIntensity=1.1;}});
      else if(obj.material)obj.material.envMapIntensity=1.1;
    }
  });
  return model;
}
function preparePalmModel(source){
  const model=source.clone(true);
  model.updateMatrixWorld(true);
  let bounds=new THREE.Box3().setFromObject(model);
  let size=bounds.getSize(new THREE.Vector3());
  const factor=8.9/Math.max(size.y,0.001);
  model.scale.setScalar(factor);
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  model.position.x-=(bounds.min.x+bounds.max.x)*0.5;
  model.position.z-=(bounds.min.z+bounds.max.z)*0.5;
  model.position.y-=bounds.min.y;
  model.updateMatrixWorld(true);
  model.traverse(obj=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true;}});
  return model;
}
function replaceVisual(target,template){
  if(!target||!template)return;
  target.children.forEach(child=>{child.visible=false;});
  target.add(template.clone(true));
}

async function loadCommunityModels(){
  const gltfLoader=new GLTFLoader();
  const sedanUrl='https://files.innerscene.com/library/sedan-car-42109739/75c64c1b3c8b03734314/sedan-original.glb';
  const supercarUrl='https://files.innerscene.com/library/generic-mid-engine-supercar-73f252c5/b41b620d8a8890b1b70a/generic-mid-engine-supercar.glb';
  const palmUrl='https://files.innerscene.com/library/palm-detailed-a8777b8c/6c1f074e83cdb7dbaeae/palm-detailed.glb';
  const [supercar,sedan,palm]=await Promise.allSettled([
    gltfLoader.loadAsync(supercarUrl),
    gltfLoader.loadAsync(sedanUrl),
    gltfLoader.loadAsync(palmUrl)
  ]);

  if(supercar.status==='fulfilled'){
    const template=prepareVehicleModel(supercar.value.scene,{width:2.09,height:1.19,length:4.631});
    replaceVisual(car,template);
  }else console.warn('Modello supercar non disponibile: uso il veicolo di riserva.',supercar.reason);

  if(sedan.status==='fulfilled'){
    const template=prepareVehicleModel(sedan.value.scene,{width:1.95,height:1.48,length:4.55});
    traffic.forEach(item=>replaceVisual(item.mesh,template));
  }else console.warn('Modello berlina non disponibile: uso i veicoli di riserva.',sedan.reason);

  if(palm.status==='fulfilled'){
    const template=preparePalmModel(palm.value.scene);
    palmGroups.forEach(group=>{
      group.children.forEach(child=>{child.visible=false;});
      group.add(template.clone(true));
    });
  }else console.warn('Modello palma non disponibile: uso la palma procedurale.',palm.reason);
}

function loadRealisticAssets(){
  const loader=new THREE.TextureLoader();
  const textureOptions=(tex,repeatX,repeatY)=>{
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(repeatX,repeatY);
    tex.colorSpace=THREE.SRGBColorSpace;
    tex.anisotropy=8;
    return tex;
  };

  const assetTasks=[loadCommunityModels()];
  assetTasks.push(loader.loadAsync('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_01/asphalt_01_diff_1k.jpg').then(tex=>{
    textureOptions(tex,45,45);
    roadMaterial.map=tex;
    roadMaterial.needsUpdate=true;
  }));
  assetTasks.push(loader.loadAsync('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_01/asphalt_01_nor_gl_1k.jpg').then(tex=>{
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(45,45);
    tex.anisotropy=8;
    roadMaterial.normalMap=tex;
    roadMaterial.normalScale.set(0.65,0.65);
    roadMaterial.needsUpdate=true;
  }));
  assetTasks.push(loader.loadAsync('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_01/asphalt_01_rough_1k.jpg').then(tex=>{
    tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(45,45);
    roadMaterial.roughnessMap=tex;
    roadMaterial.needsUpdate=true;
  }));
  assetTasks.push(new RGBELoader().setDataType(THREE.HalfFloatType).loadAsync(
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/sunset_jhbcentral_1k.hdr'
  ).then(hdr=>{
    hdr.mapping=THREE.EquirectangularReflectionMapping;
    try{
      const pmrem=new THREE.PMREMGenerator(renderer);
      if(typeof pmrem.compileEquirectangularShader==='function')pmrem.compileEquirectangularShader();
      environmentTarget=pmrem.fromEquirectangular(hdr);
      scene.environment=environmentTarget.texture;
      hdr.dispose();
      pmrem.dispose();
    }catch(err){
      console.warn('PMREM non disponibile su questo backend: uso direttamente l’HDRI.',err);
      scene.environment=hdr;
    }
    scene.environmentIntensity=0.82;
  }));
  qualityAssetsReady=Promise.allSettled(assetTasks);
  return qualityAssetsReady;
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
  const scale=0.205;
  ctx.strokeStyle='rgba(202,218,205,.48)';ctx.lineWidth=5;
  for(let k=-4;k<=4;k++){
    ctx.beginPath();ctx.moveTo(cx+(k*100-x)*scale,-20);ctx.lineTo(cx+(k*100-x)*scale,240);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-20,cy+(k*100-z)*scale);ctx.lineTo(240,cy+(k*100-z)*scale);ctx.stroke();
  }
  ctx.fillStyle='#2a7c7c';ctx.fillRect(cx+(410-x)*scale,0,12,220);
  ctx.fillStyle='rgba(255,209,173,.75)';
  for(let i=0;i<28;i++){
    const px=cx+((i*29)%190-95-x*scale),pz=cy+((i*47)%190-95-z*scale);
    ctx.fillRect(px,pz,2.5,2.5);
  }
  const m=missions[missionIndex].pos;
  ctx.fillStyle='#ff83a8';ctx.beginPath();ctx.arc(cx+(m.x-x)*scale,cy+(m.z-z)*scale,5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(255,131,168,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx+(m.x-x)*scale,cy+(m.z-z)*scale,10,0,Math.PI*2);ctx.stroke();
  ctx.translate(cx,cy);ctx.rotate(yaw);
  ctx.fillStyle='#8ffff0';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();
  ctx.restore();
}
function setCamera(dt,target,rotation){
  const offset=new THREE.Vector3(Math.sin(rotation)*16,7.4,Math.cos(rotation)*16);
  if(!inCar)offset.set(0,5.4,10.5);
  const desired=target.clone().add(offset);
  camera.position.lerp(desired,1-Math.pow(0.001,dt));
  const look=target.clone().add(new THREE.Vector3(0,inCar?1.9:1.45,0));
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
    if(car.userData.wheels)car.userData.wheels.forEach(w=>w.rotation.x-=velocity*dt/0.48);
    car.position.x=THREE.MathUtils.clamp(car.position.x,-440,440);
    car.position.z=THREE.MathUtils.clamp(car.position.z,-440,440);
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
    player.position.x=THREE.MathUtils.clamp(player.position.x,-440,440);
    player.position.z=THREE.MathUtils.clamp(player.position.z,-440,440);
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
  if(oceanSurface && frameCount%3===0){
    const position=oceanSurface.geometry.attributes.position;
    const base=oceanSurface.userData.basePositions;
    for(let i=0;i<position.count;i++){
      const x=base[i*3],y=base[i*3+1];
      position.array[i*3+2]=Math.sin(x*0.035+time*0.9)*0.18+Math.cos(y*0.028-time*0.7)*0.14;
    }
    position.needsUpdate=true;
    oceanSurface.geometry.computeVertexNormals();
  }
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


function tuneRenderResolution(dt){
  perfElapsed+=dt;
  perfFrames++;
  if(perfFrames<90)return;
  const avg=perfElapsed/perfFrames;
  let next=adaptivePixelRatio;
  if(avg>0.022)next=Math.max(0.95,adaptivePixelRatio-0.12);
  else if(avg<0.014)next=Math.min(Math.min(window.devicePixelRatio||1,1.45),adaptivePixelRatio+0.05);
  if(Math.abs(next-adaptivePixelRatio)>0.02){
    adaptivePixelRatio=next;
    renderer.setPixelRatio(adaptivePixelRatio);
    renderer.setSize(window.innerWidth,window.innerHeight,false);
  }
  perfElapsed=0;
  perfFrames=0;
}
function animate(){
  requestAnimationFrame(animate);
  if(paused||!renderer||rayTracingActive)return;
  const dt=Math.min(clock.getDelta(),0.04);
  const time=clock.elapsedTime;
  updatePlayer(dt);
  updateWorld(dt,time);
  renderer.render(scene,camera);
  tuneRenderResolution(dt);
  frameCount++;
}
function renderRayTracingFrame(){
  if(!rayTracingActive||!rayTracer)return;
  rayTracer.renderSample();
  requestAnimationFrame(renderRayTracingFrame);
}

function resize(){
  if(!renderer||!camera)return;
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(adaptivePixelRatio);
  renderer.setSize(window.innerWidth,window.innerHeight,false);
  if(rayTracingActive&&rayTracer)rayTracer.updateCamera();
}

async function startGame(){
  if(started)return;
  started=true;
  boot.classList.add('hidden');
  loading.classList.remove('hidden');
  $('load-progress').style.width='24%';
  try{
    await initRenderer();
    initScene();
    $('load-progress').style.width='52%';
    createWorld();
    $('load-progress').style.width='88%';
    window.addEventListener('resize',resize);
    resize();
    updateMission();
    $('load-progress').style.width='100%';
    $('raytrace').disabled=!rayTracingAvailable;
    $('raytrace').title=rayTracingAvailable
      ? 'Ray tracing/path tracing GPU · P · ferma la simulazione e calcola riflessi e luce con raggi reali'
      : 'Ray tracing richiede WebGPU, non disponibile in questo browser o su questa GPU';
    setTimeout(()=>{
      loading.classList.add('hidden');
      hud.classList.remove('hidden');
      paused=false;
      clock.start();
      animate();
      showToast(rayTracingAvailable?'VICE COAST · WEBGPU READY':'VICE COAST · PBR MODE');
    },350);
  }catch(err){
    console.error(err);
    showError('Errore durante la creazione della scena 3D: '+(err&&err.message?err.message:'errore sconosciuto'));
  }
}
async function toggleRayTracing(){
  if(!started||rayTracingBuilding)return;
  if(rayTracingActive){
    rayTracer.pause=true;
    rayTracingActive=false;
    if(skyDome)skyDome.visible=true;
    $('raytrace').classList.remove('active');
    $('raytrace').innerHTML='<b>RT</b><small>FOTO</small>';
    paused=false;
    clock.getDelta();
    showToast('RAY TRACING OFF · GUIDA ATTIVA');
    requestAnimationFrame(animate);
    return;
  }
  if(!rayTracingAvailable){
    showToast('RAY TRACING NON DISPONIBILE · SERVE WEBGPU');
    return;
  }

  paused=true;
  rayTracingBuilding=true;
  $('raytrace').classList.add('active');
  $('raytrace').innerHTML='<b>RT</b><small>BUILD...</small>';
  showToast('RAY TRACING · PREPARAZIONE DELLA SCENA');
  try{
    await qualityAssetsReady;
    if(skyDome)skyDome.visible=false;
    if(!rayTracer){
      rayTracer=new WebGPUPathTracer(renderer);
      rayTracer.setBVHWorker(GenerateMeshBVHWorker);
      rayTracer.maxBounces=5;
      rayTracer.frameBudget=85000;
      rayTracer.renderScale=0.72;
      rayTracer.maxSamples=64;
      rayTracer.addEventListener('progress',event=>{
        if(rayTracingBuilding&&event.stage==='building'){
          showToast('RAY TRACING · BVH '+Math.round(event.progress*100)+'%');
        }
      });
    }
    await rayTracer.setScene(scene,camera);
    rayTracer.pause=false;
    rayTracingBuilding=false;
    rayTracingActive=true;
    $('raytrace').innerHTML='<b>RT</b><small>ON</small>';
    showToast('PATH TRACING GPU · 64 CAMPIONI');
    requestAnimationFrame(renderRayTracingFrame);
  }catch(err){
    console.error('Ray tracing WebGPU non avviato:',err);
    rayTracingBuilding=false;
    rayTracingActive=false;
    if(skyDome)skyDome.visible=true;
    $('raytrace').classList.remove('active');
    $('raytrace').innerHTML='<b>RT</b><small>FOTO</small>';
    paused=false;
    clock.getDelta();
    requestAnimationFrame(animate);
    showToast('RAY TRACING NON AVVIATO · CONTROLLA WEBGPU');
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
$('raytrace').addEventListener('click',toggleRayTracing);

window.addEventListener('keydown',(e)=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys[e.code]=true;
  if(e.code==='Escape'&&started){if(paused)resumeGame();else pauseGame();}
  if(e.code==='KeyE'&&started&&!paused&&!rayTracingActive&&!e.repeat)toggleVehicle();
  if(e.code==='KeyP'&&started&&!e.repeat)toggleRayTracing();
});
window.addEventListener('keyup',(e)=>{keys[e.code]=false;});
window.addEventListener('blur',()=>{Object.keys(keys).forEach(k=>keys[k]=false);});

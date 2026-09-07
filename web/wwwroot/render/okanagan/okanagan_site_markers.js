import * as THREE from "../../vendor/three.module.js";

/** Snapshot-owned condition markers, kept separate from the unchanged mapped footprints. */
export function createOkanaganSiteMarkers(scene) {
  const geometry=new THREE.RingGeometry(17,20,16);geometry.rotateX(-Math.PI/2);
  const material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:.78,depthWrite:false});
  const mesh=new THREE.InstancedMesh(geometry,material,128);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
  const dummy=new THREE.Object3D(), color=new THREE.Color();
  return {
    update(sites) {
      mesh.count=Math.min(sites.length,128);
      for(let i=0;i<mesh.count;i++) {
        const site=sites[i];dummy.position.set(site.position.x,site.position.y+2,site.position.z);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
        // Lost stays red. A site the load reached reads blue so the drop's footprint is visible
        // on the ground; otherwise damaged, at risk, then intact.
        color.setHex(site.status==='lost'?0x9e5346:site.protected_by_drop===true?0x7fb4e6:site.status==='damaged'?0xf38d54:site.threat>.08?0xffc663:0xabc68b);mesh.setColorAt(i,color);
      }
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    },
    dispose(){geometry.dispose();material.dispose();mesh.removeFromParent();},
  };
}

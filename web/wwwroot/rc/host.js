// Enter inside the existing shell; preserve its live mission and pause ownership.
export function openRC(setPaused){
 if(document.getElementById('rc-session'))return;
 const prior=document.activeElement;
 setPaused(true);
 const frame=document.createElement('iframe');frame.id='rc-session';frame.title='Blacksite RC transmitter';frame.src='./rc/';frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:100000;background:#172124';
 const close=event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='guns-only-rc-exit')return;window.removeEventListener('message',close);frame.remove();setPaused(false);prior?.focus();};
 window.addEventListener('message',close);document.body.append(frame);frame.addEventListener('load',()=>frame.contentWindow.focus(),{once:true});
}

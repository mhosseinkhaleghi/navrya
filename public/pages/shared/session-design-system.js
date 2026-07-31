(function(){
  function marketClass(name){return 'sw-market-'+String(name||'london').toLowerCase().replace(/[^a-z]/g,'');}
  function decorate(root){
    if(!root||root.dataset.designReady==='true')return;root.dataset.designReady='true';
    const sessionName=root.querySelector('.sw-meta-name');let raw=sessionName&&sessionName.value||'';root.querySelectorAll('.session-chip').forEach(function(chip){raw+=' '+(chip.textContent||'');});['London','NewYork','Sydney','Tokyo'].some(function(name){if(raw.toLowerCase().indexOf(name.toLowerCase())>-1){root.classList.add(marketClass(name));return true;}return false;});
    root.querySelectorAll('.session-chip').forEach(function(chip){const value=chip.textContent||'';['London','NewYork','Sydney','Tokyo'].forEach(function(name){if(value.toLowerCase().indexOf(name.toLowerCase())>-1){chip.classList.add('sw-market-badge');}});});
    root.querySelectorAll('.sw-entry:not(.sw-entry-v2) .sw-entry-media img').forEach(function(image){image.addEventListener('click',function(){const lightbox=document.createElement('div');lightbox.className='sw-lightbox';const close=document.createElement('button');close.type='button';close.textContent='×';const preview=document.createElement('img');preview.src=image.src;preview.alt='';close.onclick=function(){lightbox.remove();};lightbox.onclick=function(event){if(event.target===lightbox)lightbox.remove();};lightbox.append(close,preview);document.body.append(lightbox);});});
    const closed=Array.from(root.querySelectorAll('.session-chip')).some(function(chip){return /بسته|closed|مغلق|cerrada/i.test(chip.textContent||'');});if(closed){const note=document.createElement('div');note.className='sw-readonly';const lang=document.documentElement.lang;note.textContent=lang==='fa'?'🔒 این سشن بسته شده است. برای ویرایش، آن را دوباره باز کنید.':lang==='ar'?'🔒 هذه الجلسة مغلقة. أعد فتحها للتعديل.':lang==='es'?'🔒 Esta sesión está cerrada. Vuelve a abrirla para editar.':'🔒 This session is closed. Reopen it to edit.';const top=root.querySelector('.sw-toolbar');if(top)top.insertAdjacentElement('afterend',note);const actions=root.querySelector('.sw-actions');if(actions)actions.hidden=true;}
  }
  new MutationObserver(function(){document.querySelectorAll('.sw-workspace').forEach(decorate);}).observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll('.sw-workspace').forEach(decorate);
}());

window.addEventListener('scroll', function() {
  const toc = document.getElementById('toc');
  const offsetTop = 390;
  
  if (window.scrollY >= offsetTop) {
    toc.style.position = 'fixed';
    toc.style.top = '100px';
  } else {
    toc.style.removeProperty('position');
    toc.style.removeProperty('top');
  }
});

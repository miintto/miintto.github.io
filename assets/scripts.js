document.getElementById('toggleButton').addEventListener('click', function() {
  const content = document.getElementById('navbarResponsive');
  const isExpanded = this.getAttribute('aria-expanded') === 'true';
  
  if (isExpanded) {
    content.style.height = '0px';
    this.setAttribute('aria-expanded', 'false');
  } else {
    var height = 10;
    content.querySelectorAll('.nav-item').forEach(element => {
      height += element.offsetHeight;
    });
    content.style.height = height + 'px';
    this.setAttribute('aria-expanded', 'true');
  }
});

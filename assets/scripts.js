document.getElementById('toggleButton').addEventListener('click', function() {
  const content = document.getElementById('navbarResponsive');
  const isExpanded = this.getAttribute('aria-expanded') === 'true';
  
  if (isExpanded) {
    content.style.display = 'none';
    this.setAttribute('aria-expanded', 'false');
  } else {
    content.style.display = 'block';
    this.setAttribute('aria-expanded', 'true');
  }
});

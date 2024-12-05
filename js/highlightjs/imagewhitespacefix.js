const images = document.querySelectorAll("img");

images.forEach(function(img) {
  let currentSrc = img.src;

  currentSrc = currentSrc.replace(/%20/g, ' ');

  img.src = currentSrc;
});

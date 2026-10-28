/* Halloween 2026, home page only. Sets the class that switches the theme on, and stops doing so from 2 November. It is a plain blocking script in <head> on purpose: the accent colour has to be set before the first paint. To remove it, see the Halloween comments in index.html. */
(function(){
  if (new Date() < new Date(2026, 10, 2)) document.documentElement.classList.add('halloween');
})();

/* Halloween 2026, home page only. Switches itself off from 2 November. To remove it, delete the two Halloween lines in index.html's <head>, then delete this file and halloween.css. */
(function(){
  var ENABLED = true;
  var END = new Date(2026, 10, 2);
  if (!ENABLED || new Date() >= END) return;
  document.documentElement.classList.add('halloween');
  document.addEventListener('DOMContentLoaded', function(){
    var sub = document.querySelector('.hero p.sub');
    if (!sub) return;
    var line = document.createElement('p');
    line.className = 'halloween-line';
    line.innerHTML = '<svg class="halloween-ghost" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V11a7 7 0 0 1 14 0v10l-2.33-2-2.34 2-2.33-2-2.33 2-2.34-2L5 21z"/><path d="M9.5 11h.01M14.5 11h.01"/></svg><span>Haunted by unexplained flows</span>';
    sub.parentNode.insertBefore(line, sub.nextSibling);
  });
})();

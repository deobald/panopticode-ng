window.addEventListener('load', () => setTimeout(() => {
  try {
    const check = (value, message) => { if (!value) throw new Error(message); };
    const select = document.getElementById('metric');
    check(window.matchMedia('(prefers-color-scheme: dark)').matches === (location.hash === '#dark'), 'requested color scheme');
    check(document.querySelectorAll('.pass').length === 5, 'analyzer statuses');
    check(document.querySelectorAll('.tile').length > 0, 'treemap rendered');
    check(document.querySelectorAll('#inventory tr').length > 0, 'inventory rendered');
    document.querySelector('.tile').click();
    check(document.querySelector('#detail h2').textContent.length > 0, 'selection detail');
    for (const metric of ['coverage', 'duplication', 'findings', 'nesting', 'complexity']) {
      select.value = metric; select.dispatchEvent(new Event('change'));
      check(document.getElementById('legend').textContent.length > 0, 'metric legend');
      check(!document.getElementById('map').textContent.includes('NaN'), 'valid geometry');
    }
    document.querySelector('.tile').dispatchEvent(new MouseEvent('dblclick'));
    check(document.querySelectorAll('#breadcrumbs button').length >= 2, 'zoom navigation');
    document.querySelector('#breadcrumbs button').click();
    const search = document.getElementById('search');
    search.value = '__no_such_source_region__'; search.dispatchEvent(new Event('input'));
    check(document.querySelectorAll('.tile').length === 0, 'search filters map');
    check(document.querySelectorAll('#inventory tr').length === 0, 'search filters inventory');
    search.value = ''; search.dispatchEvent(new Event('input'));
    check(document.querySelectorAll('.tile').length > 0, 'search reset');
    const sort = document.getElementById('sort');
    sort.value = 'name'; sort.dispatchEvent(new Event('change'));
    const overflow = [...document.querySelectorAll('body *')].filter(n => n.getBoundingClientRect().right > window.innerWidth + 2).slice(0,8).map(n => n.tagName+'.'+n.className).join(', ');
    check(document.documentElement.scrollWidth <= window.innerWidth + 2, `responsive viewport (${document.documentElement.scrollWidth}/${window.innerWidth}: ${overflow})`);
    check(!document.querySelector('script[src],link[rel=stylesheet],iframe'), 'offline assets');
    check(document.querySelectorAll('.tile').length === document.querySelectorAll('.tile[aria-label]').length, 'accessible source labels');
    document.body.dataset.browserCheck = 'passed';
  } catch (error) {
    document.body.dataset.browserCheck = 'failed';
    document.body.appendChild(document.createTextNode('BROWSER FAILURE: ' + error.message));
  }
}, 300));

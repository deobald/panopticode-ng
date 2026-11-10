const report = JSON.parse(document.getElementById('report-data').textContent);
const $ = id => document.getElementById(id);
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
const root = {name:report.name, path:'', children:[], parent:null};
const nodes = new Map([['',root]]);
const allRegions = [];
for (const file of report.files) {
  let parent = root;
  let path = '';
  const parts = file.path.split('/');
  for (let i=0;i<parts.length;i++) {
    path += (path ? '/' : '') + parts[i];
    if (!nodes.has(path)) {
      const node = {name:parts[i],path,children:[],parent};
      nodes.set(path,node); parent.children.push(node);
    }
    parent = nodes.get(path);
  }
  parent.file = file;
  for (const region of file.regions) {
    const node = {name:region.name,path:file.path,region,file,parent,children:[]};
    parent.children.push(node); allRegions.push(node);
  }
}
function aggregate(node) {
  node.children.forEach(aggregate);
  node.files = node.file ? [node.file] : [...new Set(node.children.flatMap(n=>n.files))];
  node.weight = node.region ? Math.max(1,node.region.statements) : Math.max(1,node.children.reduce((s,n)=>s+n.weight,0));
  node.complexity = node.region?.complexity ?? (node.children.some(n=>n.complexity!==null) ? Math.max(...node.children.map(n=>n.complexity??0)) : null);
  node.nesting = node.region?.maxNesting ?? (node.children.some(n=>n.nesting!==null) ? Math.max(...node.children.map(n=>n.nesting??0)) : null);
  node.children.sort((a,b)=>b.weight-a.weight || a.name.localeCompare(b.name));
}
aggregate(root);
let scope=root, selected=root, query='', metric='complexity', order='complexity', limit=100;
const colors=['#82b5a1','#e1bd68','#ce795e','#783f51'];
function coverage(files) {
  const known=files.filter(f=>f.coverage?.total>0);
  return {covered:known.reduce((s,f)=>s+f.coverage.covered,0), total:known.reduce((s,f)=>s+f.coverage.total,0), known:known.length};
}
function percent(c) {return c.total ? `${Math.round(c.covered/c.total*100)}% (${c.covered}/${c.total} lines)` : 'Unknown';}
function data(node) {
  const files=node.files;
  const measured=files.filter(f=>f.findings!==null);
  const findings=measured.flatMap(f=>f.findings);
  const duplicate=files.filter(f=>f.duplicatedLines!==null);
  const duplicated=duplicate.reduce((s,f)=>s+f.duplicatedLines,0);
  const lines=duplicate.reduce((s,f)=>s+f.physicalLines,0);
  return {files,measured,findings,duplicate,duplicated,lines,coverage:coverage(files)};
}
function band(value,boundaries) {return boundaries.filter(b=>value>=b).length;}
function appearance(node) {
  const d=data(node);
  if (metric==='complexity') return {value:node.complexity===null?'Unknown':`Max CCN ${node.complexity}`,color:node.complexity===null?null:colors[band(node.complexity,[5,10,20])]};
  if (metric==='nesting') return {value:node.nesting===null?'Unknown':`Depth ${node.nesting}`,color:node.nesting===null?null:colors[band(node.nesting,[3,5,7])]};
  if (metric==='coverage') return {value:percent(d.coverage)+(d.coverage.known<d.files.length?' · partial scope':''),color:d.coverage.total?colors[d.coverage.covered/d.coverage.total>=.75?0:d.coverage.covered/d.coverage.total>=.5?1:d.coverage.covered>0?2:3]:null};
  if (metric==='duplication') return {value:d.duplicate.length?`${d.duplicated} duplicated lines${d.duplicate.length<d.files.length?' · partial scope':''}`:'Unknown',color:d.duplicate.length?colors[d.duplicated===0?0:d.duplicated/d.lines<.1?1:d.duplicated/d.lines<.25?2:3]:null};
  const failed=report.analyzers.some(p=>p.id==='diagnostics' && p.status==='failed');
  return {value:d.measured.length?`${d.findings.length} file findings${failed?' · incomplete pass':d.measured.length<d.files.length?' · partial scope':''}`:'Unknown',color:d.measured.length && (!failed || d.findings.length)?colors[d.findings.some(f=>f.severity==='error')?2:d.findings.length?1:0]:null};
}
function matches(node) {return !query || `${node.path} ${node.name}`.toLowerCase().includes(query) || node.children.some(matches);}
function choose(node) {selected=node; drawMap(); drawDetail();}
function zoom(node) {scope=node;selected=node;limit=100;draw();}
function drawMap() {
  const container=$('map'); container.replaceChildren();
  const items=(scope.children.length?scope.children:[scope]).filter(matches);
  const visible=items.slice(0,500);
  const bounds={x:0,y:0,width:container.clientWidth,height:container.clientHeight};
  for (const rectangle of partition(visible,bounds)) {
    const node=rectangle.item, value=appearance(node);
    const button=el('button',undefined,'tile'+(value.color?'':' unknown')+(node===selected?' selected':''));
    Object.assign(button.style,{left:`${rectangle.x}px`,top:`${rectangle.y}px`,width:`${rectangle.width}px`,height:`${rectangle.height}px`});
    if (value.color) button.style.background=value.color;
    button.append(el('b',node.name));
    if (rectangle.width>95 && rectangle.height>55) button.append(el('small',value.value));
    button.title=`${node.path || report.name}\n${node.region?node.region.name+'\n':''}${value.value}`;
    button.setAttribute('aria-label',button.title);
    button.setAttribute('aria-pressed',String(node===selected));
    button.addEventListener('click',()=>choose(node));
    button.addEventListener('dblclick',()=>{if(node.children.length)zoom(node);});
    button.addEventListener('keydown',event=>{if(event.key==='ArrowRight' && node.children.length){event.preventDefault();zoom(node);$('breadcrumbs').lastChild?.focus();}});
    container.append(button);
  }
  $('map-note').textContent=`${items.length} matching regions in this view${items.length>500?' · Showing the 500 largest; narrow the search to see others':''}. Unknown evidence uses a striped fill. Findings, coverage and duplication colors describe file scope.`;
  const legends={complexity:'CCN: green 1–4 · yellow 5–9 · orange 10–19 · purple 20+',nesting:'Depth: green 0–2 · yellow 3–4 · orange 5–6 · purple 7+',coverage:'Measured lines: green ≥75% · yellow ≥50% · orange >0% · purple 0%',duplication:'Duplicated lines: green 0% · yellow <10% · orange <25% · purple ≥25%',findings:'Green: no reported findings · yellow: warnings/notes · orange: errors · see pass status for completeness'};
  $('legend').textContent=legends[metric];
}
function list(parent,title,items) {
  parent.append(el('h3',title));
  if(!items.length){parent.append(el('p','None available in this scope.','muted'));return;}
  const ul=el('ul'); items.forEach(item=>ul.append(el('li',item))); parent.append(ul);
}
function drawDetail() {
  const aside=$('detail'); aside.replaceChildren();
  const d=data(selected);
  aside.append(el('p',selected.region?'SOURCE REGION':selected.file?'SOURCE FILE':'DIRECTORY / PROJECT','eyebrow'),el('h2',selected.name),el('p',selected.path || report.name,'path'));
  if(selected.region) aside.append(el('p',`Lines ${selected.region.line}–${selected.region.endLine} · ${selected.region.statements} statements · CCN ${selected.region.complexity} · nesting ${selected.region.maxNesting}`));
  if(selected.file && !selected.file.parsed) aside.append(el('p','Syntax failed. Measurements for this file are unknown.'));
  aside.append(el('p',`${d.files.length} files · ${d.measured.length}/${d.files.length} with diagnostic evidence · ${d.duplicate.length}/${d.files.length} with duplication evidence`));
  aside.append(el('p',`Coverage: ${percent(d.coverage)} · measured in ${d.coverage.known}/${d.files.length} files. Unknown files are excluded from this percentage.`));
  if(selected.children.length){const button=el('button','Explore this scope →');button.addEventListener('click',()=>zoom(selected));aside.append(button);}
  const findings=d.files.flatMap(f=>(f.findings??[]).map(v=>({file:f.path,...v})));
  aside.append(el('h3',`Correctness & security (${findings.length})`));
  const findingList=el('ul');
  for(const finding of findings.slice(0,100)) {
    const item=el('li');item.append(el('strong',`${finding.rule} · ${finding.severity}`),el('div',finding.message),el('code',`${finding.file}${finding.line?':'+finding.line:''}`));
    if(finding.help && /^https?:\/\//i.test(finding.help)){const link=el('a',' Rule documentation');link.href=finding.help;link.rel='noreferrer';item.append(link);}
    findingList.append(item);
  }
  aside.append(findingList);
  if(!findings.length) aside.append(el('p',d.measured.length?'No findings reported in measured files; check pass status.':'Diagnostics unknown in this scope.','muted'));
  if(findings.length>100) aside.append(el('p','Showing the first 100 findings. Select a narrower scope; all findings are in report.json.'));
  const shapes=selected.file?selected.file.types:[];
  if(shapes.length) list(aside,'Type structure',shapes.map(t=>`${t.kind}: ${t.name}:${t.line} · ${t.methods} methods/constructors · ${t.properties} properties/events${t.bases.length?' · bases: '+t.bases.join(', '):''}`));
  const fileSet=new Set(d.files.map(f=>f.path));
  const duplicates=(report.duplicates??[]).filter(b=>fileSet.has(b.first.file)||fileSet.has(b.second.file));
  list(aside,`Duplicate pairs (${duplicates.length})`,duplicates.slice(0,40).map(b=>`${b.first.file}:${b.first.line}–${b.first.endLine} ↔ ${b.second.file}:${b.second.line}–${b.second.endLine} (${b.tokens} tokens)`));
  if(duplicates.length>40)aside.append(el('p','Showing the first 40 pairs. All pairs are in report.json.'));
  const metrics=report.projectMetrics.filter(m=>m.file && fileSet.has(m.file));
  list(aside,`Microsoft semantic metrics (${metrics.length})`,metrics.slice(0,30).map(m=>`${m.name}: ${Object.entries(m.values).map(([k,v])=>k+'='+v).join(' · ')}`));
  if(metrics.length>30)aside.append(el('p','Showing the first 30 entities. Select a file; all metrics are in report.json.'));
}
function drawInventory() {
  const files=new Set(scope.files.map(f=>f.path));
  let rows=allRegions.filter(n=>files.has(n.path) && matches(n));
  rows.sort((a,b)=>order==='name'?`${a.path}:${a.region.line}`.localeCompare(`${b.path}:${b.region.line}`,undefined,{numeric:true}):order==='findings'?(b.file.findings?.length??-1)-(a.file.findings?.length??-1):b.region[order]-a.region[order]);
  const body=$('inventory');body.replaceChildren();
  for(const node of rows.slice(0,limit)){
    const row=el('tr'),name=el('td'),button=el('button',node.name);button.addEventListener('click',()=>choose(node));name.append(button);row.append(name,el('td',`${node.path}:${node.region.line}–${node.region.endLine}`),el('td',node.region.statements),el('td',node.region.complexity),el('td',node.region.maxNesting));body.append(row);
  }
  $('more').hidden=rows.length<=limit;
}
function draw() {
  const trail=[];for(let n=scope;n;n=n.parent)trail.unshift(n);
  $('breadcrumbs').replaceChildren();
  for(const node of trail){const button=el('button',node.name);button.addEventListener('click',()=>zoom(node));$('breadcrumbs').append(button);}
  drawMap();drawDetail();drawInventory();
}
$('name').textContent=report.name;$('generated').textContent=`Generated ${new Date(report.generatedAt).toLocaleString()} · C# schema ${report.schemaVersion}`;
const c=coverage(report.files);
for(const [value,label] of [[report.files.length,'C# source files'],[allRegions.length,'Callable / top-level regions'],[`${report.files.filter(f=>f.findings!==null).length}/${report.files.length}`,'Files with diagnostic evidence'],[c.total?Math.round(c.covered/c.total*100)+'%':'Unknown',`Measured coverage · ${c.known}/${report.files.length} files`]]){const card=el('div',undefined,'stat');card.append(el('strong',value),el('span',label));$('summary').append(card);}
for(const pass of report.analyzers){const card=el('div',undefined,'pass '+pass.status);card.append(el('b',`${pass.id} · ${pass.status}`),el('small',`${pass.files} files · ${pass.durationMs} ms`),el('p',pass.detail),el('small',pass.version));$('passes').append(card);}
$('warning-count').textContent=`Analysis notes (${report.warnings.length})`;for(const warning of report.warnings)$('warnings').append(el('li',warning));if(report.warnings.length)$('warnings-panel').open=true;
for(const [name,definition] of Object.entries(report.definitions)){const block=el('div');block.append(el('h3',name),el('p',definition));$('definitions').append(block);}
$('metric').addEventListener('change',event=>{metric=event.target.value;drawMap();});
$('search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();limit=100;drawMap();drawInventory();});
$('sort').addEventListener('change',event=>{order=event.target.value;drawInventory();});
$('more').addEventListener('click',()=>{limit+=100;drawInventory();});
new ResizeObserver(drawMap).observe($('map'));
draw();

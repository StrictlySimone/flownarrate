// Each tool lives on its own page; only initialise the tools present on this one.
function onPage(id, init){
  if (document.getElementById(id)) init();
}

const exprDefs = {
  addDays: {
    fields: [
      {key:'ts', label:'Timestamp (defaults to now)', value:'utcNow()'},
      {key:'days', label:'Number of days to add', value:'1'}
    ],
    build: v => `addDays(${v.ts}, ${v.days})`
  },
  formatDateTime: {
    fields: [
      {key:'ts', label:'Timestamp', value:'utcNow()'},
      {key:'format', label:'Format string', value:"'yyyy-MM-dd'"}
    ],
    build: v => `formatDateTime(${v.ts}, ${v.format})`
  },
  concat: {
    fields: [
      {key:'a', label:'First value', value:"'Case #'"},
      {key:'b', label:'Second value', value:"triggerBody()?['caseNumber']"}
    ],
    build: v => `concat(${v.a}, ${v.b})`
  },
  if: {
    fields: [
      {key:'cond', label:'Condition', value:"equals(triggerBody()?['priority'], 'Urgent')"},
      {key:'yes', label:'Value if true', value:"'On-call'"},
      {key:'no', label:'Value if false', value:"'Standard queue'"}
    ],
    build: v => `if(${v.cond}, ${v.yes}, ${v.no})`
  },
  coalesce: {
    fields: [
      {key:'a', label:'First value (checked first)', value:"triggerBody()?['assignedTo']"},
      {key:'b', label:'Fallback value', value:"'Unassigned'"}
    ],
    build: v => `coalesce(${v.a}, ${v.b})`
  },
  substring: {
    fields: [
      {key:'text', label:'Text value', value:"triggerBody()?['caseNumber']"},
      {key:'start', label:'Start index', value:'0'},
      {key:'len', label:'Length', value:'4'}
    ],
    build: v => `substring(${v.text}, ${v.start}, ${v.len})`
  },
  triggerOutput: {
    fields: [
      {key:'path', label:'Property name from the trigger body', value:'caseNumber'}
    ],
    build: v => `triggerBody()?['${v.path}']`
  },
  actionOutput: {
    fields: [
      {key:'action', label:'Action name (as shown in the flow)', value:'Get_item'},
      {key:'path', label:'Property name from that action output', value:'Title'}
    ],
    build: v => `body('${v.action}')?['${v.path}']`
  },
  loopItem: {
    fields: [
      {key:'path', label:'Property name on the current item (leave blank for the whole item)', value:'Id'}
    ],
    build: v => v.path ? `items('Apply_to_each')?['${v.path}']` : `items('Apply_to_each')`
  },
  variable: {
    fields: [
      {key:'name', label:'Variable name', value:'RetryCount'}
    ],
    build: v => `variables('${v.name}')`
  }
};

function renderExprInputs(){
  const fn = document.getElementById('expr-fn').value;
  const def = exprDefs[fn];
  const container = document.getElementById('expr-inputs');
  container.innerHTML = '';
  def.fields.forEach(f => {
    const row = document.createElement('div');
    row.className = 'expr-row';
    const label = document.createElement('label');
    label.setAttribute('for', 'expr-input-' + f.key);
    label.textContent = f.label;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'expr-input-' + f.key;
    input.value = f.value;
    input.addEventListener('input', updateExprOutput);
    row.appendChild(label);
    row.appendChild(input);
    container.appendChild(row);
  });
  updateExprOutput();
}

function updateExprOutput(){
  const fn = document.getElementById('expr-fn').value;
  const def = exprDefs[fn];
  const values = {};
  def.fields.forEach(f => {
    values[f.key] = document.getElementById('expr-input-' + f.key).value || f.value;
  });
  document.getElementById('expr-result').textContent = def.build(values);
}

function copyExpr(){
  const text = document.getElementById('expr-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('expr-copy-status').textContent = 'Expression copied to clipboard';
  }).catch(() => {
    document.getElementById('expr-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

onPage('expr-fn', renderExprInputs);

// Rows below are built with innerHTML + template literals; field/value
// always land in an HTML attribute, so they're escaped before insertion.
// Not exploitable today (every call site passes hardcoded example
// strings or nothing at all) but cheap to close off now rather than
// wait for a "load from URL" feature to make it a real DOM-XSS bug.
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

// --- Filter / condition builder ---
let filterRowId = 0;
const operators = ['equals','not equals','greater than','less than','contains'];

function addFilterRow(field, op, value){
  filterRowId++;
  const id = filterRowId;
  const row = document.createElement('div');
  row.className = 'filter-row';
  row.id = 'filter-row-' + id;
  row.innerHTML = `
    <input type="text" placeholder="Field name" value="${escapeHtml(field || '')}" aria-label="Field name" oninput="updateFilterOutput()">
    <select aria-label="Operator" onchange="updateFilterOutput()">
      ${operators.map(o => `<option value="${o}" ${o === op ? 'selected' : ''}>${o}</option>`).join('')}
    </select>
    <input type="text" placeholder="Value" value="${escapeHtml(value || '')}" aria-label="Value" oninput="updateFilterOutput()">
    <button type="button" class="remove-row" onclick="removeFilterRow(${id})" aria-label="Remove this condition">Remove</button>
  `;
  document.getElementById('filter-rows').appendChild(row);
  updateFilterOutput();
}

function removeFilterRow(id){
  const row = document.getElementById('filter-row-' + id);
  if (row) row.remove();
  updateFilterOutput();
}

function opToPowerFx(op, field, value){
  const v = isNaN(value) || value === '' ? `"${value}"` : value;
  switch(op){
    case 'equals': return `${field} = ${v}`;
    case 'not equals': return `${field} <> ${v}`;
    case 'greater than': return `${field} > ${v}`;
    case 'less than': return `${field} < ${v}`;
    case 'contains': return `${field} in ${v}`;
    default: return `${field} = ${v}`;
  }
}

function opToTrigger(op, field, value){
  const v = isNaN(value) || value === '' ? `'${value}'` : value;
  switch(op){
    case 'equals': return `equals(triggerBody()?['${field}'], ${v})`;
    case 'not equals': return `not(equals(triggerBody()?['${field}'], ${v}))`;
    case 'greater than': return `greater(triggerBody()?['${field}'], ${v})`;
    case 'less than': return `less(triggerBody()?['${field}'], ${v})`;
    case 'contains': return `contains(triggerBody()?['${field}'], ${v})`;
    default: return `equals(triggerBody()?['${field}'], ${v})`;
  }
}

function updateFilterOutput(){
  const target = document.getElementById('filter-target').value;
  const source = document.getElementById('filter-source').value || 'DataSource';
  const logic = document.getElementById('filter-logic').value;
  document.getElementById('filter-source-field').style.display = target === 'powerfx' ? 'block' : 'none';

  const rows = Array.from(document.querySelectorAll('.filter-row'));
  if (rows.length === 0){
    document.getElementById('filter-result').textContent = target === 'powerfx'
      ? `Filter(${source}, true)`
      : `@${logic.toLowerCase()}()`;
    return;
  }

  const parts = rows.map(row => {
    const [fieldInput, opSelect, valueInput] = row.querySelectorAll('input, select');
    const field = fieldInput.value || 'FieldName';
    const op = opSelect.value;
    const value = valueInput.value;
    return target === 'powerfx' ? opToPowerFx(op, field, value) : opToTrigger(op, field, value);
  });

  if (target === 'powerfx'){
    const combined = parts.length === 1 ? parts[0] : `${logic}(${parts.join(', ')})`;
    document.getElementById('filter-result').textContent = `Filter(${source}, ${combined})`;
  } else {
    const combined = parts.length === 1 ? parts[0] : `@${logic.toLowerCase()}(${parts.join(', ')})`;
    document.getElementById('filter-result').textContent = parts.length === 1 ? `@${parts[0]}` : combined;
  }
}

function copyFilter(){
  const text = document.getElementById('filter-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('filter-copy-status').textContent = 'Result copied to clipboard';
  }).catch(() => {
    document.getElementById('filter-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

onPage('filter-rows', function(){
  addFilterRow('Priority', 'equals', 'Urgent');
  addFilterRow('Status', 'not equals', 'Closed');
});

// --- SharePoint column formatting ---
function updateColumnFormat(){
  const field = document.getElementById('cf-field').value || 'FieldName';
  const op = document.getElementById('cf-operator').value;
  const value = document.getElementById('cf-value').value;
  const color = document.getElementById('cf-color').value;
  const json = {
    "$schema": "https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json",
    "elmType": "div",
    "style": {
      "background-color": `=if([$${field}] ${op} '${value}', '${color}', '')`,
      "padding": "5px"
    },
    "txtContent": "@currentField"
  };
  document.getElementById('cf-result').textContent = JSON.stringify(json, null, 2);
}

function copyColumnFormat(){
  const text = document.getElementById('cf-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('cf-copy-status').textContent = 'JSON copied to clipboard';
  }).catch(() => {
    document.getElementById('cf-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

// --- SVG to Power Apps image data URI ---
function updateSvgOutput(){
  const svg = document.getElementById('svg-input').value.trim();
  let result;
  try {
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    result = `"data:image/svg+xml;base64,${encoded}"`;
  } catch(e){
    result = 'Could not encode this SVG, check the markup is valid.';
  }
  document.getElementById('svg-result').textContent = result;
}

function copySvg(){
  const text = document.getElementById('svg-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('svg-copy-status').textContent = 'Data URI copied to clipboard';
  }).catch(() => {
    document.getElementById('svg-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

onPage('cf-result', updateColumnFormat);
onPage('svg-result', updateSvgOutput);

// --- Parse JSON schema generator ---
function inferSchema(value){
  if (value === null) return { type: "string" };
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length ? inferSchema(value[0]) : {}
    };
  }
  switch (typeof value){
    case 'string': return { type: "string" };
    case 'number': return { type: "number" };
    case 'boolean': return { type: "boolean" };
    case 'object': {
      const properties = {};
      Object.keys(value).forEach(k => { properties[k] = inferSchema(value[k]); });
      return { type: "object", properties };
    }
    default: return { type: "string" };
  }
}

function updateJsonSchema(){
  const raw = document.getElementById('json-input').value;
  const errorEl = document.getElementById('json-error');
  try {
    const parsed = JSON.parse(raw);
    const schema = inferSchema(parsed);
    document.getElementById('json-schema-result').textContent = JSON.stringify(schema, null, 2);
    errorEl.textContent = '';
  } catch(e){
    errorEl.textContent = 'That is not valid JSON, the schema will update once it parses.';
  }
}

function copyJsonSchema(){
  const text = document.getElementById('json-schema-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('json-schema-copy-status').textContent = 'Schema copied to clipboard';
  }).catch(() => {
    document.getElementById('json-schema-copy-status').textContent = 'Copy failed, select the text manually';
  });
}


onPage('json-schema-result', updateJsonSchema);

// --- Date Formatter ---
function updateDateFormatter(){
  const sourceSel = document.getElementById('df-source').value;
  document.getElementById('df-custom-field').style.display = sourceSel === 'custom' ? 'block' : 'none';
  const source = sourceSel === 'custom' ? document.getElementById('df-custom').value : sourceSel;

  const formatSel = document.getElementById('df-format').value;
  document.getElementById('df-custom-format-field').style.display = formatSel === 'custom' ? 'block' : 'none';
  const format = formatSel === 'custom' ? document.getElementById('df-custom-format').value : formatSel;

  const timezone = document.getElementById('df-timezone').value.trim();

  let expr = timezone
    ? `formatDateTime(convertTimeZone(${source}, 'UTC', '${timezone}'), '${format}')`
    : `formatDateTime(${source}, '${format}')`;

  document.getElementById('df-result').textContent = expr;
}

function copyDateFormatter(){
  const text = document.getElementById('df-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('df-copy-status').textContent = 'Expression copied to clipboard';
  }).catch(() => {
    document.getElementById('df-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

// --- JSON Schema Loosener ---
function loosenSchema(node){
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(loosenSchema);

  const result = {};
  Object.keys(node).forEach(key => {
    if (key === 'required') return; // strip required arrays entirely
    if (key === 'type'){
      const t = node[key];
      if (Array.isArray(t)) {
        result[key] = t.includes('null') ? t : [...t, 'null'];
      } else if (t !== 'null') {
        result[key] = [t, 'null'];
      } else {
        result[key] = t;
      }
    } else if (key === 'properties' || key === 'items') {
      result[key] = loosenSchema(node[key]);
    } else {
      result[key] = node[key];
    }
  });
  return result;
}

function updateLoosenedSchema(){
  const raw = document.getElementById('loosen-input').value;
  const errorEl = document.getElementById('loosen-error');
  try {
    const parsed = JSON.parse(raw);
    const loosened = loosenSchema(parsed);
    document.getElementById('loosen-result').textContent = JSON.stringify(loosened, null, 2);
    errorEl.textContent = 'Removes every "required" array and allows null on every property type, so the action stops throwing when a field is missing.';
  } catch(e){
    errorEl.textContent = 'That is not valid JSON, paste a schema (the output of the JSON Schema Converter above works directly).';
  }
}

function copyLoosenedSchema(){
  const text = document.getElementById('loosen-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('loosen-copy-status').textContent = 'Schema copied to clipboard';
  }).catch(() => {
    document.getElementById('loosen-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

// --- Adaptive Card Builder ---
function updateAdaptiveCard(){
  const title = document.getElementById('ac-title').value || 'Title';
  const body = document.getElementById('ac-body').value || '';
  const includeButtons = document.getElementById('ac-buttons').checked;

  const card = {
    type: "AdaptiveCard",
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true },
      { type: "TextBlock", text: body, wrap: true }
    ]
  };
  if (includeButtons){
    card.actions = [
      { type: "Action.Submit", title: "Approve", data: { action: "approve" } },
      { type: "Action.Submit", title: "Reject", data: { action: "reject" } }
    ];
  }
  document.getElementById('ac-result').textContent = JSON.stringify(card, null, 2);
}

function copyAdaptiveCard(){
  const text = document.getElementById('ac-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('ac-copy-status').textContent = 'Card JSON copied to clipboard';
  }).catch(() => {
    document.getElementById('ac-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

// --- Flow Error Handler ---
function updateErrorHandler(){
  const scope = document.getElementById('eh-scope').value || 'Try_scope';
  const statuses = Array.from(document.querySelectorAll('#error-handler input[type=checkbox]:checked')).map(el => el.value);

  const runAfter = { runAfter: { [scope]: statuses.length ? statuses : ['Failed'] } };
  document.getElementById('eh-runafter').textContent = JSON.stringify(runAfter, null, 2);

  const errorExpr = `coalesce(result('${scope}')[0]?['error']?['message'], 'Unknown error in ${scope}')`;
  document.getElementById('eh-error').textContent = errorExpr;

  const message = `The flow failed in "${scope}".\\n\\nError: @{${errorExpr}}\\nRun: @{workflow()?['run']?['name']}`;
  document.getElementById('eh-message').textContent = message;
}

function copyErrorHandler(){
  const text = [
    document.getElementById('eh-runafter').textContent,
    document.getElementById('eh-error').textContent,
    document.getElementById('eh-message').textContent
  ].join('\n\n');
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('eh-copy-status').textContent = 'All three copied to clipboard';
  }).catch(() => {
    document.getElementById('eh-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

// --- HTML Table Styler ---
function updateHtmlTable(){
  const columns = document.getElementById('ht-columns').value.split(',').map(c => c.trim()).filter(Boolean);
  const color = document.getElementById('ht-color').value;
  const rowCount = parseInt(document.getElementById('ht-rows').value) || 0;

  const thStyle = `background-color:${color};color:#ffffff;padding:10px 14px;text-align:left;font-family:Arial,sans-serif;font-size:14px;border:1px solid ${color};`;
  const tdStyle = `padding:10px 14px;font-family:Arial,sans-serif;font-size:14px;border:1px solid #dddddd;`;

  let html = `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">\n  <tr>\n`;
  columns.forEach(c => { html += `    <th style="${thStyle}">${c}</th>\n`; });
  html += `  </tr>\n`;
  for (let r = 0; r < rowCount; r++){
    html += `  <tr>\n`;
    columns.forEach(() => { html += `    <td style="${tdStyle}">&nbsp;</td>\n`; });
    html += `  </tr>\n`;
  }
  html += `</table>`;

  document.getElementById('ht-result').textContent = html;
}

function copyHtmlTable(){
  const text = document.getElementById('ht-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('ht-copy-status').textContent = 'HTML copied to clipboard';
  }).catch(() => {
    document.getElementById('ht-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

// --- OData Query ---
let odataRowId = 0;
const odataOperators = { 'equals':'eq', 'not equals':'ne', 'greater than':'gt', 'less than':'lt', 'contains':'substringof' };

function addOdataRow(field, op, value){
  odataRowId++;
  const id = odataRowId;
  const row = document.createElement('div');
  row.className = 'filter-row';
  row.id = 'odata-row-' + id;
  row.innerHTML = `
    <input type="text" placeholder="Field name" value="${escapeHtml(field || '')}" aria-label="Field name" oninput="updateOdataQuery()">
    <select aria-label="Operator" onchange="updateOdataQuery()">
      ${Object.keys(odataOperators).map(o => `<option value="${o}" ${o === op ? 'selected' : ''}>${o}</option>`).join('')}
    </select>
    <input type="text" placeholder="Value" value="${escapeHtml(value || '')}" aria-label="Value" oninput="updateOdataQuery()">
    <button type="button" class="remove-row" onclick="removeOdataRow(${id})" aria-label="Remove this condition">Remove</button>
  `;
  document.getElementById('odata-rows').appendChild(row);
  updateOdataQuery();
}

function removeOdataRow(id){
  const row = document.getElementById('odata-row-' + id);
  if (row) row.remove();
  updateOdataQuery();
}

function updateOdataQuery(){
  const logic = document.getElementById('odata-logic').value;
  const rows = Array.from(document.querySelectorAll('#odata-rows .filter-row'));

  const parts = rows.map(row => {
    const [fieldInput, opSelect, valueInput] = row.querySelectorAll('input, select');
    const field = fieldInput.value || 'FieldName';
    const op = opSelect.value;
    const value = valueInput.value;
    const odataOp = odataOperators[op] || 'eq';
    const isNumeric = value !== '' && !isNaN(value);
    if (odataOp === 'substringof'){
      return `substringof('${value}', ${field})`;
    }
    return `${field} ${odataOp} ${isNumeric ? value : `'${value}'`}`;
  });

  let query = '';
  if (parts.length){
    query += `$filter=${parts.join(` ${logic} `)}`;
  }
  const select = document.getElementById('odata-select').value.trim();
  const orderby = document.getElementById('odata-orderby').value.trim();
  const top = document.getElementById('odata-top').value.trim();

  if (select) query += (query ? '&' : '') + `$select=${select.split(',').map(s=>s.trim()).join(',')}`;
  if (orderby) query += (query ? '&' : '') + `$orderby=${orderby}`;
  if (top) query += (query ? '&' : '') + `$top=${top}`;

  document.getElementById('odata-result').textContent = query || 'Add at least one condition, or set $select / $top / $orderby.';
}

function copyOdataQuery(){
  const text = document.getElementById('odata-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('odata-copy-status').textContent = 'Query copied to clipboard';
  }).catch(() => {
    document.getElementById('odata-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

onPage('df-result', updateDateFormatter);
onPage('loosen-result', updateLoosenedSchema);
onPage('ac-result', updateAdaptiveCard);
onPage('eh-runafter', updateErrorHandler);
onPage('ht-result', updateHtmlTable);
onPage('odata-rows', function(){ addOdataRow('Priority', 'equals', 'Urgent'); });

// --- D365 FetchXML Builder ---
let fxRowId = 0;
const fxOperators = { 'equals':'eq', 'not equals':'ne', 'greater than':'gt', 'less than':'lt', 'contains':'like' };

function addFetchXmlRow(field, op, value){
  fxRowId++;
  const id = fxRowId;
  const row = document.createElement('div');
  row.className = 'filter-row';
  row.id = 'fx-row-' + id;
  row.innerHTML = `
    <input type="text" placeholder="Attribute name" value="${escapeHtml(field || '')}" aria-label="Attribute name" oninput="updateFetchXml()">
    <select aria-label="Operator" onchange="updateFetchXml()">
      ${Object.keys(fxOperators).map(o => `<option value="${o}" ${o === op ? 'selected' : ''}>${o}</option>`).join('')}
    </select>
    <input type="text" placeholder="Value" value="${escapeHtml(value || '')}" aria-label="Value" oninput="updateFetchXml()">
    <button type="button" class="remove-row" onclick="removeFetchXmlRow(${id})" aria-label="Remove this condition">Remove</button>
  `;
  document.getElementById('fx-rows').appendChild(row);
  updateFetchXml();
}

function removeFetchXmlRow(id){
  const row = document.getElementById('fx-row-' + id);
  if (row) row.remove();
  updateFetchXml();
}

function escapeXml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateFetchXml(){
  const entity = document.getElementById('fx-entity').value || 'entity';
  const attrsRaw = document.getElementById('fx-attributes').value.trim();
  const logic = document.getElementById('fx-logic').value;
  const orderby = document.getElementById('fx-orderby').value.trim();
  const descending = document.getElementById('fx-descending').checked;
  const top = document.getElementById('fx-top').value.trim();

  const rows = Array.from(document.querySelectorAll('#fx-rows .filter-row'));

  let xml = `<fetch${top ? ` top="${escapeXml(top)}"` : ''}>\n`;
  xml += `  <entity name="${escapeXml(entity)}">\n`;

  if (attrsRaw){
    attrsRaw.split(',').map(a => a.trim()).filter(Boolean).forEach(attr => {
      xml += `    <attribute name="${escapeXml(attr)}" />\n`;
    });
  } else {
    xml += `    <all-attributes />\n`;
  }

  if (orderby){
    xml += `    <order attribute="${escapeXml(orderby)}"${descending ? ' descending="true"' : ''} />\n`;
  }

  if (rows.length){
    xml += `    <filter type="${logic}">\n`;
    rows.forEach(row => {
      const [fieldInput, opSelect, valueInput] = row.querySelectorAll('input, select');
      const field = fieldInput.value || 'attributename';
      const op = fxOperators[opSelect.value] || 'eq';
      const value = valueInput.value;
      xml += `      <condition attribute="${escapeXml(field)}" operator="${op}" value="${escapeXml(value)}" />\n`;
    });
    xml += `    </filter>\n`;
  }

  xml += `  </entity>\n`;
  xml += `</fetch>`;

  document.getElementById('fx-result').textContent = xml;
}

function copyFetchXml(){
  const text = document.getElementById('fx-result').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('fx-copy-status').textContent = 'FetchXML copied to clipboard';
  }).catch(() => {
    document.getElementById('fx-copy-status').textContent = 'Copy failed, select the text manually';
  });
}

onPage('fx-rows', function(){ addFetchXmlRow('prioritycode', 'equals', '1'); });

function currentTheme(){
  var attr = document.documentElement.getAttribute("data-theme");
  if (attr) return attr;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncThemeButton(){
  var btn = document.getElementById("theme-toggle");
  if (!btn) return;
  var theme = currentTheme();
  btn.textContent = theme === "dark" ? "Light" : "Dark";
  btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

function toggleTheme(){
  var next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("flownarrate-theme", next); } catch(e) { /* ignore */ }
  syncThemeButton();
}

function toggleNav(){
  var links = document.getElementById('nav-links');
  var btn = document.getElementById('nav-toggle');
  var isOpen = links.classList.toggle('open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

document.querySelectorAll('#nav-links a').forEach(function(link){
  link.addEventListener('click', function(){
    var links = document.getElementById('nav-links');
    var btn = document.getElementById('nav-toggle');
    links.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
});

var yearEl = document.getElementById('copyright-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

syncThemeButton();

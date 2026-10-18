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

// --- Microsoft Forms pre-filled link builder ---
// Everything is learned from one sample pre-filled link. Forms encodes each
// question type differently, so the sample's values tell us the type:
//   text:   Dfffff                                  (raw)
//   choice: "Yes"                                   (JSON string)
//   multi:  "[\"Radio\",\"Flyer\"]"                 (JSON array, stringified twice)
//   grid:   {"r<row>":{"id":1,"key":"<guid>"},...}  (Likert rows -> column)
//   date:   "2026-10-17"                            (JSON string, ISO date)
//   number: 4                                       (raw; rating, NPS, number-only text)
// A stray space in a choice option is stored as a non-breaking space, and a
// pre-filled answer must match it exactly, so options seen in the sample are
// kept and reused character for character.
// The DOM is built with createElement/textContent throughout, because the
// sample link and the answers are user input.
let pfBase = '';
let pfFixedParams = [];
let pfQuestions = [];
const pfTypeNames = {
  text: 'text answer',
  choice: 'choice, pick one',
  multi: 'choice, pick one or more',
  grid: 'grid (Likert)',
  date: 'date',
  number: 'number (rating, score or number question)'
};

function pfStatus(id, message){
  const el = document.getElementById(id);
  // Clear first so a screen reader announces the same message twice in a row.
  el.textContent = '';
  setTimeout(() => { el.textContent = message; }, 50);
}

function pfEl(tag, props, children){
  const el = document.createElement(tag);
  Object.assign(el, props || {});
  (children || []).forEach(c => el.append(c));
  return el;
}

function pfDetectType(raw){
  const v = raw.trim();
  if (v.startsWith('{')){
    try {
      const obj = JSON.parse(v);
      const rows = Object.keys(obj).filter(k => obj[k] && obj[k].key);
      if (rows.length) return { type: 'grid', grid: obj };
    } catch(e) { /* not JSON, fall through to text */ }
  }
  if (v.startsWith('"')){
    try {
      const s = JSON.parse(v);
      if (typeof s === 'string'){
        if (s.startsWith('[')){
          try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) return { type: 'multi', sample: arr.join(', '), options: arr };
          } catch(e) { /* a choice that happens to start with [ */ }
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { type: 'date', sample: s };
        return { type: 'choice', sample: s, options: [s] };
      }
    } catch(e) { /* fall through */ }
  }
  if (/^\d+$/.test(v)) return { type: 'number', sample: v };
  return { type: 'text', sample: raw };
}

function pfReadSample(moveFocus){
  const input = document.getElementById('pf-sample').value.trim();
  let url;
  try {
    url = new URL(input);
  } catch(e) {
    pfStatus('pf-read-status', 'That does not look like a link. Paste the whole pre-filled link, starting with https.');
    return;
  }
  const params = Array.from(url.searchParams.entries());
  const isQuestion = name => /^r[0-9a-f]{32}$/i.test(name);
  if (!url.searchParams.get('id') || !params.some(([name]) => isQuestion(name))){
    pfStatus('pf-read-status', 'No questions found in that link. Check it is a pre-filled link from Get Pre-filled URL, with at least one answer filled in.');
    return;
  }

  const titles = pfTitles();
  pfBase = url.origin + url.pathname;
  pfFixedParams = params.filter(([name]) => !isQuestion(name));
  pfQuestions = params.filter(([name]) => isQuestion(name)).map(([name, value], i) => {
    const found = pfDetectType(value);
    const q = {
      param: name,
      number: i + 1,
      title: titles[i] || '',
      type: found.type,
      sample: found.sample || '',
      options: found.options || [],
      answer: '',
      leaveOut: false
    };
    if (found.type === 'grid'){
      q.rows = Object.keys(found.grid).map((rowParam, r) => ({ param: rowParam, name: 'Row ' + (r + 1), answer: '' }));
      const cols = {};
      Object.values(found.grid).forEach(c => { cols[c.key] = c.id; });
      q.cols = Object.keys(cols).map(key => ({ key: key, id: cols[key], name: '' })).sort((a, b) => a.id - b.id);
    }
    return q;
  });

  pfRenderQuestions();
  pfRenderTestOptions();
  pfGridNamesFromFormText();
  pfReady = true;
  pfShowMode();
  pfUpdateLink();

  const counts = {};
  pfQuestions.forEach(q => { counts[q.type] = (counts[q.type] || 0) + 1; });
  const summary = Object.keys(counts).map(t => counts[t] + ' ' + pfTypeNames[t]).join(', ');
  if (moveFocus) document.getElementById(pfMode() === 'basic' ? 'pf-ai-heading' : 'pf-step2-heading').focus();
  pfStatus('pf-read-status', 'Found ' + pfQuestions.length + ' questions: ' + summary + '. Step 2 is next.');
}

function pfQuestionLabel(q){
  return 'Question ' + q.number + (q.title ? ': ' + q.title : '');
}

function pfRenderQuestions(){
  const box = document.getElementById('pf-questions');
  box.textContent = '';
  pfQuestions.forEach(q => box.append(pfRenderQuestion(q)));
}

function pfRenderQuestion(q){
  const id = 'pf-q' + q.number;
  const wrap = pfEl('div', { className: 'pf-question', id: id + '-block' });
  const hint = pfEl('p', { className: 'pf-hint', id: id + '-hint' });

  if (q.type === 'grid'){
    const fieldset = pfEl('fieldset', {}, [pfEl('legend', { className: 'pf-label', textContent: pfQuestionLabel(q) + ' (grid)' })]);
    hint.textContent = 'Choose a column for each row. Sample link used columns with id ' + q.cols.map(c => c.id).join(', ') + '. A column the sample did not use cannot be chosen.';
    fieldset.append(hint);

    const colNames = pfEl('div', { className: 'pf-sub' }, [
      pfEl('label', { htmlFor: id + '-cols', textContent: 'Names for the columns with id ' + q.cols.map(c => c.id).join(', ') + ', in that order, separated by commas (optional)' }),
      pfEl('input', { type: 'text', id: id + '-cols', value: q.cols.map(c => c.name).filter(Boolean).join(', '),
        oninput: e => {
          const names = e.target.value.split(',').map(s => s.trim());
          q.cols.forEach((c, i) => { c.name = names[i] || ''; });
          pfRefreshGridSelects(q);
        } })
    ]);
    const rowNames = pfEl('div', { className: 'pf-sub' }, [
      pfEl('label', { htmlFor: id + '-rows', textContent: 'Row names, one per line (optional)' }),
      pfEl('textarea', { id: id + '-rows', rows: 3, value: q.rows.map(r => r.name).join('\n'),
        onchange: e => {
          const names = e.target.value.split('\n').map(s => s.trim());
          q.rows.forEach((r, i) => { r.name = names[i] || ('Row ' + (i + 1)); });
          pfRefreshGridSelects(q);
        } })
    ]);
    fieldset.append(colNames, rowNames);

    q.rows.forEach((row, r) => {
      const select = pfEl('select', { id: id + '-r' + r, onchange: e => { row.answer = e.target.value; pfUpdateLink(); } });
      const label = pfEl('label', { htmlFor: select.id, textContent: row.name });
      fieldset.append(pfEl('div', { className: 'pf-grid-row' }, [label, select]));
    });
    wrap.append(fieldset);
    pfRefreshGridSelects(q);
  } else {
    const multiline = q.type === 'text' || q.type === 'multi';
    const field = pfEl(multiline ? 'textarea' : 'input', { id: id,
      oninput: e => { q.answer = e.target.value; pfUpdateHint(q); pfUpdateLink(); } });
    if (multiline) field.rows = q.type === 'text' ? 5 : 3;
    else field.type = q.type === 'date' ? 'date' : 'text';
    if (q.type === 'number') field.inputMode = 'numeric';
    field.value = q.answer;
    field.setAttribute('aria-describedby', hint.id);
    wrap.append(pfEl('label', { htmlFor: id, className: 'pf-label', textContent: pfQuestionLabel(q) }), field, hint);
  }

  const leaveOut = pfEl('input', { type: 'checkbox', id: id + '-out', checked: q.leaveOut,
    onchange: e => { q.leaveOut = e.target.checked; pfUpdateLink(); } });
  wrap.append(pfEl('label', { className: 'check-label', htmlFor: leaveOut.id }, [leaveOut, 'Leave question ' + q.number + ' out of the link (paste it by hand instead)']));
  pfUpdateHint(q, hint);
  return wrap;
}

function pfRefreshGridSelects(q){
  q.rows.forEach((row, r) => {
    const select = document.getElementById('pf-q' + q.number + '-r' + r);
    if (!select) return;
    select.previousElementSibling.textContent = row.name;
    select.textContent = '';
    select.append(pfEl('option', { value: '', textContent: 'No answer' }));
    q.cols.forEach(c => select.append(pfEl('option', { value: c.key, textContent: c.name || ('Column with id ' + c.id) })));
    select.value = row.answer;
  });
}

function pfUpdateHint(q, el){
  const hint = el || document.getElementById('pf-q' + q.number + '-hint');
  if (!hint || q.type === 'grid') return;
  const len = q.answer.length;
  if (q.type === 'text'){
    hint.textContent = 'Text answer. ' + len.toLocaleString('en-GB') + ' characters.' +
      (len > 4000 ? ' Over 4,000 characters, which is more than a long answer box takes.' : '');
  } else if (q.type === 'choice'){
    hint.textContent = 'Choice, pick one. Type the option exactly as the form shows it. Sample answer: ' + pfShowOption(q.sample);
  } else if (q.type === 'multi'){
    hint.textContent = 'Choice, pick one or more. One option per line, exactly as the form shows it. Sample answer: ' + q.options.map(pfShowOption).join(', ');
  } else if (q.type === 'date'){
    hint.textContent = 'Date. Sample answer: ' + q.sample.split('-').reverse().join('/');
  } else {
    hint.textContent = 'Number only. For a star rating, the number of stars; for a 0 to 10 score, the score. Sample answer: ' + q.sample;
  }
}

function pfShowOption(option){
  return /^\u00a0|\u00a0$/.test(option) ? option.trim() + ' (has a hidden space, kept automatically)' : option;
}

// Use the sample's exact spelling of an option when the answer matches it
// apart from spaces and capitals.
function pfExactOption(q, value){
  const norm = v => v.replace(/\u00a0/g, ' ').trim().toLowerCase();
  return q.options.find(o => norm(o) === norm(value)) || value;
}

function pfEncodeValue(q){
  if (q.type === 'text') return q.answer.trim() ? q.answer : null;
  if (q.type === 'choice') return q.answer.trim() ? JSON.stringify(pfExactOption(q, q.answer)) : null;
  if (q.type === 'date') return q.answer ? JSON.stringify(q.answer) : null;
  if (q.type === 'number') return q.answer.trim() ? q.answer.trim() : null;
  if (q.type === 'multi'){
    const picks = q.answer.split('\n').filter(s => s.trim()).map(s => pfExactOption(q, s));
    return picks.length ? JSON.stringify(JSON.stringify(picks)) : null;
  }
  const grid = {};
  q.rows.forEach(row => {
    const col = q.cols.find(c => c.key === row.answer);
    if (col) grid[row.param] = { id: col.id, key: col.key };
  });
  return Object.keys(grid).length ? JSON.stringify(grid) : null;
}

function pfBuildUrl(extra){
  const parts = pfFixedParams.map(([name, value]) => name + '=' + encodeURIComponent(value));
  pfQuestions.forEach(q => {
    if (q.leaveOut) return;
    const value = pfEncodeValue(q);
    if (value !== null) parts.push(q.param + '=' + encodeURIComponent(value));
  });
  (extra || []).forEach(p => parts.push(p));
  return pfBase + '?' + parts.join('&');
}

function pfUpdateLink(){
  const link = pfBuildUrl();
  const len = link.length;
  document.getElementById('pf-open').href = link;
  document.getElementById('pf-link').textContent = link;
  let advice;
  // 5,739 characters is the longest link tested on a real form so far.
  if (len <= 5739) advice = 'Within the length tested on Microsoft Forms, so it should load.';
  else if (len <= 8000) advice = 'Longer than tested. It may work: check the last answers arrived in full, or use the length test in step 4.';
  else advice = 'Probably too long. Tick "Leave out of the link" for the longest answers and paste those by hand.';
  document.getElementById('pf-length').textContent = 'The link is ' + len.toLocaleString('en-GB') + ' characters long. ' + advice;
}

function pfCopyLink(){
  navigator.clipboard.writeText(pfBuildUrl()).then(() => {
    pfStatus('pf-link-status', 'Link copied to clipboard');
  }).catch(() => {
    pfStatus('pf-link-status', 'Copy failed. Use the Open the form link instead.');
  });
}

// "Question 3: answer" blocks from Copilot. Markdown bold around the
// heading is common, so it is stripped.
function pfFillFromPaste(){
  const result = pfApplyAnswers(document.getElementById('pf-paste').value);
  pfRenderQuestions();
  pfUpdateLink();
  let msg = 'Filled ' + result.filled.length + ' of ' + pfQuestions.length + ' questions.';
  if (result.missing.length) msg += ' No answer found for question ' + result.missing.join(', ') + '.';
  if (result.problems.length) msg += ' Could not use: ' + result.problems.join('; ') + '.';
  msg += ' Check the answers in the boxes below.';
  pfStatus('pf-paste-status', msg);
  return msg;
}

function pfApplyAnswers(text){
  const blocks = {};
  let current = null;
  text.split(/\r?\n/).forEach(line => {
    const m = line.replace(/\*\*/g, '').match(/^\s*#*\s*(?:question|q)\s*(\d+)\s*[:.)\-–—]\s?(.*)$/i);
    if (m){
      current = Number(m[1]);
      blocks[current] = [m[2]];
    } else if (current !== null){
      blocks[current].push(line);
    }
  });

  const filled = [], missing = [], problems = [];
  pfQuestions.forEach(q => {
    const lines = blocks[q.number];
    const answer = lines ? lines.join('\n').trim() : '';
    if (!answer){ missing.push(q.number); return; }
    filled.push(q.number);
    if (q.type === 'multi'){
      q.answer = answer.split(/\n|;/).map(s => s.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).join('\n');
    } else if (q.type === 'grid'){
      answer.split('\n').forEach(line => {
        const m = line.replace(/^\s*[-*•]\s*/, '').match(/^(.+?)\s*[:=]\s*(.+)$/);
        if (!m) return;
        const rowText = m[1].trim().toLowerCase(), colText = m[2].trim().toLowerCase();
        const row = q.rows.find((r, i) => r.name.toLowerCase() === rowText || String(i + 1) === rowText.replace(/^row\s*/, ''));
        const col = q.cols.find(c => (c.name && c.name.toLowerCase() === colText) || String(c.id) === colText);
        if (row && col) row.answer = col.key;
        else problems.push('question ' + q.number + ', "' + line.trim() + '"');
      });
    } else if (q.type === 'date'){
      const m = answer.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      q.answer = m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : answer;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.answer)){ q.answer = ''; problems.push('question ' + q.number + ', "' + answer + '" is not a date'); }
    } else {
      q.answer = answer;
    }
  });
  return { filled: filled, missing: missing, problems: problems };
}

function pfCopilotPrompt(){
  const lines = pfQuestions.map(q => {
    let how = pfTypeNames[q.type];
    if (q.type === 'grid'){
      how += ', one line per row as "row name: column name"';
      if (q.cols.some(c => c.name)) how += '. Rows: ' + q.rows.map(r => r.name).join(', ') + '. Columns: ' + q.cols.map(c => c.name || ('id ' + c.id)).join(', ');
    }
    if (q.type === 'multi') how += ', one option per line';
    if (q.type === 'date') how += ', written as dd/mm/yyyy';
    if (q.type === 'number') how += ', the number only';
    return 'Question ' + q.number + (q.title ? ' (' + q.title + ')' : '') + ': ' + how;
  });
  return 'Write my answers out again in exactly this format, with nothing before or after. ' +
    'Start each answer on a new line with "Question", its number and a colon, then the answer. ' +
    'Do not repeat the question. For choice questions use the option wording exactly as the form shows it.\n\n' +
    lines.join('\n');
}

function pfCopyPrompt(){
  navigator.clipboard.writeText(pfCopilotPrompt()).then(() => {
    pfStatus('pf-paste-status', 'Copilot prompt copied to clipboard');
  }).catch(() => {
    pfStatus('pf-paste-status', 'Copy failed.');
  });
}

function pfRenderCopyBlocks(){
  const box = document.getElementById('pf-copy-blocks');
  box.textContent = '';
  const list = pfQuestions.filter(q => q.type !== 'grid' && q.answer.trim() && (q.leaveOut || !document.getElementById('pf-copy-only-left').checked));
  if (!list.length){
    box.append(pfEl('p', { className: 'pf-hint', textContent: 'No answers to copy yet.' }));
    pfStatus('pf-copy-status', 'No answers to copy yet.');
    return;
  }
  list.forEach(q => {
    const btn = pfEl('button', { type: 'button', className: 'copy-btn',
      textContent: 'Question ' + q.number + ': copy answer',
      onclick: () => navigator.clipboard.writeText(q.answer).then(
        () => pfStatus('pf-copy-status', 'Question ' + q.number + ' answer copied. ' + q.answer.length + ' characters.'),
        () => pfStatus('pf-copy-status', 'Copy failed.')) });
    box.append(pfEl('div', { className: 'pf-copy-block' }, [
      pfEl('h3', { textContent: pfQuestionLabel(q) }),
      pfEl('p', { className: 'pf-hint', textContent: q.answer.length.toLocaleString('en-GB') + ' characters' }),
      btn
    ]));
  });
  pfStatus('pf-copy-status', list.length + (list.length === 1 ? ' copy button' : ' copy buttons') + ' ready below.');
}

// --- Length test ---
function pfRenderTestOptions(){
  const select = document.getElementById('pf-test-question');
  select.textContent = '';
  pfQuestions.filter(q => q.type === 'text').forEach(q => {
    select.append(pfEl('option', { value: q.number, textContent: pfQuestionLabel(q) }));
  });
  select.append(pfEl('option', { value: 'pad', textContent: 'No question: pad the link with an extra unused parameter' }));
}

function pfTestAnswer(base, target, label){
  // Spaces and full stops make the answer encode like real writing.
  const start = 'Start of test ' + label + '. ';
  const end = ' End of test ' + label + '.';
  const filler = 'Test words, and more. ';
  let body = '';
  while (base.length + encodeURIComponent(start + body + filler + end).length <= target && (start + body + end).length < 4000){
    body += filler;
  }
  return start + body + end;
}

function pfMakeTests(){
  const choice = document.getElementById('pf-test-question').value;
  const box = document.getElementById('pf-test-links');
  box.textContent = '';
  const targets = [2000, 4000, 6000, 8000, 12000, 16000, 24000, 32000];
  const list = pfEl('ul', { className: 'pf-test-list' });
  let capped = false;
  targets.forEach(target => {
    if (capped) return;
    const label = target.toLocaleString('en-GB');
    let link;
    if (choice === 'pad'){
      const base = pfBuildUrl() + '&pad=';
      link = base + 'x'.repeat(Math.max(0, target - base.length));
    } else {
      const q = pfQuestions.find(x => x.number === Number(choice));
      const saved = { answer: q.answer, leaveOut: q.leaveOut };
      q.answer = ''; q.leaveOut = true;
      const base = pfBuildUrl() + '&' + q.param + '=';
      q.answer = saved.answer; q.leaveOut = saved.leaveOut;
      const answer = pfTestAnswer(base, target, label);
      link = base + encodeURIComponent(answer);
      // A text box takes about 4,000 characters, so past that the answer
      // stops growing; stop rather than repeat the same link.
      if (answer.length >= 4000) capped = true;
    }
    list.append(pfEl('li', {}, [
      pfEl('a', { href: link, target: '_blank', rel: 'noopener noreferrer',
        textContent: 'Test link, ' + link.length.toLocaleString('en-GB') + ' characters (opens in a new tab)' })
    ]));
  });
  box.append(list);
  let msg = list.children.length + ' test links ready below, shortest first.';
  if (capped) msg += ' The answer reached 4,000 characters, so longer links need the padding option.';
  pfStatus('pf-test-status', msg);
}

// --- Basic and advanced modes ---
// Basic: the AI writes the answers and the link, and the tool checks the
// link. Advanced: answers typed into boxes or loaded from a file.
let pfReady = false;

function pfMode(){
  return document.getElementById('pf-mode-advanced').checked ? 'advanced' : 'basic';
}

function pfShowMode(){
  const mode = pfMode();
  document.querySelectorAll('[data-pf-mode]').forEach(el => {
    el.hidden = el.dataset.pfMode !== mode || (el.dataset.pfAfterRead === 'true' && !pfReady);
  });
  document.querySelectorAll('[data-pf-after-read]:not([data-pf-mode])').forEach(el => { el.hidden = !pfReady; });
}

// Question titles: the titles box, or else lines like "3. How did you hear
// about this event?" in the copied form text.
function pfTitles(){
  const typed = document.getElementById('pf-titles').value.split('\n').map(t => t.trim()).filter(Boolean);
  if (typed.length) return typed;
  const titles = [];
  document.getElementById('pf-form-text').value.split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*(\d+)\.\s+(.+?)\s*$/);
    if (m) titles[Number(m[1]) - 1] = m[2];
  });
  return titles;
}

// Grid row and column names from the copied form text: the lines under the
// grid question are the column headings (tab-separated, or one per line)
// followed by one line per row.
function pfGridNamesFromFormText(){
  const lines = document.getElementById('pf-form-text').value.split(/\r?\n/);
  pfQuestions.filter(q => q.type === 'grid').forEach(q => {
    const startAt = lines.findIndex(l => new RegExp('^\\s*' + q.number + '\\.\\s').test(l));
    if (startAt < 0) return;
    const block = [];
    for (let i = startAt + 1; i < lines.length && !/^\s*\d+\.\s/.test(lines[i]); i++){
      if (lines[i].trim()) block.push(lines[i]);
    }
    let cols, rows;
    if (block.length && block[0].includes('\t')){
      cols = block[0].split('\t').map(c => c.trim()).filter(Boolean);
      rows = block.slice(1).map(r => r.split('\t')[0].trim());
    } else {
      const k = block.length - q.rows.length;
      if (k < 1) return;
      cols = block.slice(0, k).map(c => c.trim());
      rows = block.slice(k).map(r => r.trim());
    }
    if (rows.length !== q.rows.length || cols.length < Math.max(...q.cols.map(c => c.id))) return;
    q.rows.forEach((r, i) => { r.name = rows[i]; });
    q.cols.forEach(c => { c.name = cols[c.id - 1]; });
  });
}

// The prompt carries everything the AI needs to write the link: the IDs, the
// exact options seen in the sample, and how each question type is encoded.
function pfAiPrompt(){
  const notes = document.getElementById('pf-notes').value.trim();
  const formText = document.getElementById('pf-form-text').value.trim();
  const enc = v => encodeURIComponent(v);
  const lines = pfQuestions.map(q => {
    let line = 'Question ' + q.number + (q.title ? ' (' + q.title + ')' : '') + ': ID ' + q.param + ', ' + pfTypeNames[q.type] + '.';
    if (q.options.length) line += ' Option(s) seen in the sample, encoded exactly: ' + q.options.map(o => enc(o)).join(', ') + '.';
    if (q.type === 'grid'){
      line += ' Rows in order: ' + q.rows.map((r, i) => (r.name || 'Row ' + (i + 1)) + ' = ' + r.param).join(', ') + '.';
      line += ' Columns: ' + q.cols.map(c => 'id ' + c.id + (c.name ? ' (' + c.name + ')' : '') + ' key ' + c.key).join(', ') + '. Column id 1 is the first column on the form.';
    }
    return line;
  });
  const start = pfBase + '?' + pfFixedParams.map(([name, value]) => name + '=' + enc(value)).join('&');
  return [
    'I need to fill in a Microsoft Form. Using my notes, answer every question you can. Then:',
    '1. List the answers, one line per question, as "Question 1: answer", so I can check them.',
    '2. Give me a pre-filled link for the form on its own line, with nothing around it.',
    '',
    'How to build the link:',
    '- Start with exactly: ' + start,
    '- For each answered question add &<question ID>=<value>. Leave out questions you cannot answer.',
    '- URL-encode every value: space %20, " %22, & %26, comma %2C, colon %3A, / %2F, [ %5B, ] %5D, \\ %5C, { %7B, } %7D.',
    '- Text and number questions: the text or number itself. A star rating is the number of stars.',
    '- Choice, pick one: the option in double quotes. "Yes" becomes %22Yes%22.',
    '- Choice, pick one or more: a list inside double quotes, with inner quotes escaped. "[\\"Radio\\",\\"Flyer\\"]" becomes %22%5B%5C%22Radio%5C%22%2C%5C%22Flyer%5C%22%5D%22. Put a typed "Other" answer in the list as its own item.',
    '- Date: "yyyy-mm-dd" in double quotes. "2026-10-18" becomes %222026-10-18%22.',
    '- Grid: {"<row ID>":{"id":<column id>,"key":"<column key>"},...} with one entry per answered row, then URL-encoded.',
    '- Use each option\'s wording exactly as the form shows it. If an option is listed below with %C2%A0 in it, keep the %C2%A0: it is a hidden space the form needs.',
    '',
    'Questions:',
    lines.join('\n'),
    formText ? '\nThe form as it appears on screen (for question wording and options):\n' + formText : '',
    '\nMy notes:',
    notes || '(none, ask me if you need more information)'
  ].join('\n');
}

function pfCopyAiPrompt(){
  navigator.clipboard.writeText(pfAiPrompt()).then(() => {
    pfStatus('pf-ai-status', 'AI prompt copied. Paste it into Copilot or another AI, then paste its reply in step 3.');
  }).catch(() => {
    document.getElementById('pf-ai-prompt').hidden = false;
    document.getElementById('pf-ai-prompt').textContent = pfAiPrompt();
    pfStatus('pf-ai-status', 'Copy failed. The prompt is shown below; select it and copy it yourself.');
  });
}

// Read the answers back out of a link, so the AI's link can be checked and
// rebuilt with the tool's exact encoding.
function pfDecodeInto(q, raw, problems){
  const fail = () => problems.push('question ' + q.number + ' could not be read');
  try {
    if (q.type === 'text' || q.type === 'number'){ q.answer = raw; return; }
    if (q.type === 'choice' || q.type === 'date'){ q.answer = JSON.parse(raw); return; }
    if (q.type === 'multi'){ q.answer = JSON.parse(JSON.parse(raw)).join('\n'); return; }
    const grid = JSON.parse(raw);
    q.rows.forEach(row => {
      const cell = grid[row.param];
      const col = cell && q.cols.find(c => c.key === cell.key || c.id === cell.id);
      row.answer = col ? col.key : '';
      if (cell && !col) problems.push('question ' + q.number + ', ' + row.name + ' uses a column the sample link never used');
    });
  } catch(e) { fail(); }
}

function pfDescribe(q){
  if (q.type === 'grid'){
    const done = q.rows.filter(r => r.answer).map(r => r.name + ': ' + (q.cols.find(c => c.key === r.answer).name || 'column ' + q.cols.find(c => c.key === r.answer).id));
    return done.length ? done.join('; ') : '';
  }
  if (q.type === 'date' && q.answer) return q.answer.split('-').reverse().join('/');
  return q.answer.replace(/\n/g, ', ');
}

function pfCheckReply(){
  const reply = document.getElementById('pf-reply').value;
  const problems = [];
  pfQuestions.forEach(q => { q.answer = ''; q.leaveOut = false; if (q.rows) q.rows.forEach(r => { r.answer = ''; }); });

  const found = reply.match(/https:\/\/[^\s<>()\[\]`]*ResponsePage\.aspx\?[^\s<>()\[\]`]+/i);
  let source;
  if (found){
    source = 'link';
    let url;
    try { url = new URL(found[0]); } catch(e) { url = null; }
    if (!url){
      problems.push('the link in the reply is broken');
    } else {
      if (url.searchParams.get('id') !== new URLSearchParams(pfFixedParams).get('id')) problems.push('the link is for a different form');
      url.searchParams.forEach((value, name) => {
        const q = pfQuestions.find(x => x.param === name);
        if (q) pfDecodeInto(q, value, problems);
        else if (/^r[0-9a-f]{32}$/i.test(name)) problems.push('the link has a question ID the form does not have');
      });
      // Choice answers that only matched after fixing spaces or capitals.
      pfQuestions.forEach(q => {
        if (q.type === 'choice' && q.answer && pfExactOption(q, q.answer) !== q.answer) problems.push('question ' + q.number + ' needed its hidden space fixing');
      });
    }
  } else {
    source = 'answers';
    const result = pfApplyAnswers(reply);
    result.problems.forEach(p => problems.push(p));
  }

  pfRenderQuestions();
  pfUpdateLink();
  const list = document.getElementById('pf-answers');
  list.textContent = '';
  let answered = 0;
  pfQuestions.forEach(q => {
    const text = pfDescribe(q);
    if (text) answered++;
    list.append(pfEl('li', {}, [
      pfEl('span', { className: 'pf-answers-q', textContent: pfQuestionLabel(q) }),
      pfEl('span', { className: text ? 'pf-answers-a' : 'pf-answers-a pf-answers-none', textContent: text || 'No answer' })
    ]));
  });
  document.getElementById('pf-answers-block').hidden = false;

  let msg = source === 'link'
    ? 'Read the link from the reply: ' + answered + ' of ' + pfQuestions.length + ' questions answered.'
    : 'No link in the reply, so the tool built one from the answers: ' + answered + ' of ' + pfQuestions.length + ' questions answered.';
  if (problems.length) msg += ' Fixed or flagged: ' + problems.join('; ') + '.';
  msg += ' The answers are listed below. The Open the pre-filled form link uses them.';
  pfStatus('pf-reply-status', msg);
}

// Advanced: a .txt or .md file with a "Sample link:" line and
// "Question 1: answer" lines.
function pfLoadFile(input){
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result);
    const link = text.match(/https:\/\/\S*ResponsePage\.aspx\?\S+/i);
    if (!link){
      pfStatus('pf-read-status', 'No form link found in ' + file.name + '. Add a line starting "Sample link:" with the pre-filled link.');
      return;
    }
    document.getElementById('pf-sample').value = link[0];
    pfReadSample(false);
    document.getElementById('pf-paste').value = text;
    pfStatus('pf-read-status', 'Loaded ' + file.name + '. ' + pfFillFromPaste());
  };
  reader.readAsText(file);
}

// Browsers can restore the sample link after Back; read it straight away.
onPage('pf-sample', function(){
  pfShowMode();
  if (document.getElementById('pf-sample').value.trim()) pfReadSample();
});

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

/*
BabelTable — Trình biên dịch / trình thông dịch nhỏ bằng JavaScript
Phiên bản: full patched
- Hỗ trợ identifier Unicode (tiếng Việt)
- Hỗ trợ gán bằng '=' và gán cho ô: ô(1,2) = 'x'
- Chấp nhận ':' ở cuối header như Python
- Fix hasOwnProperty cho runtime.vars
- Hỗ trợ vùng A1, A1:E3 thông qua builtin vùng() và đặt_vùng()

Sử dụng: BabelTable.run(codeString, {root: document})
*/

const BabelTable = (function(){

// Unicode-aware utilities
function isDigit(ch){ return /[0-9]/.test(ch); }
function isIdStart(ch){ return /[\p{L}_]/u.test(ch); }
function isIdPart(ch){ return /[\p{L}\p{N}_]/u.test(ch); }

// Lexer: line-based, indentation-sensitive
function lex(input){
    input = input.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    const lines = input.split('\n');
    const tokens = [];
    const indentStack = [0];
    for(let lineno=0; lineno<lines.length; lineno++){
        let line = lines[lineno];
        const commentIndex = line.indexOf('#');
        if(commentIndex !== -1) line = line.slice(0,commentIndex);
        if(/^[ \t]*$/.test(line)) continue;
        const m = line.match(/^([ \t]*)/);
        const indent = (m && m[1]) ? m[1].replace(/\t/g,'    ').length : 0;
        if(indent > indentStack[indentStack.length-1]){
            indentStack.push(indent);
            tokens.push({type:'INDENT', value: null, lineno: lineno+1});
        } else {
            while(indent < indentStack[indentStack.length-1]){
                indentStack.pop();
                tokens.push({type:'DEDENT', value:null, lineno: lineno+1});
            }
            if(indent !== indentStack[indentStack.length-1]){
                throw new Error('Lỗi indent ở dòng '+(lineno+1));
            }
        }
        let i=0;
        while(i < line.length && /[ \t]/.test(line[i])) i++;
        while(i < line.length){
            const ch = line[i];
            if(ch==='"' || ch==="'"){
                const q = ch; i++;
                let str = '';
                while(i<line.length && line[i]!==q){
                    if(line[i]==='\\' && i+1<line.length){ str += line[i+1]; i+=2; } else { str += line[i++]; }
                }
                i++; tokens.push({type:'STRING', value:str, lineno: lineno+1});
            } else if(isDigit(ch) || (ch==='.' && isDigit(line[i+1]))){
                let num = '';
                while(i<line.length && /[0-9\.]/.test(line[i])) num += line[i++];
                tokens.push({type:'NUMBER', value: Number(num), lineno: lineno+1});
            } else if(isIdStart(ch)){
                let id='';
                while(i<line.length && isIdPart(line[i])) id+=line[i++];
                tokens.push({type:'IDENT', value:id, lineno: lineno+1});
            } else if(/[,()=+\-*/<>:%]/.test(ch)){
                const two = line.substr(i,2);
                if(['==','!=','<=','>='].includes(two)){
                    tokens.push({type:'OP', value:two, lineno: lineno+1}); i+=2;
                } else {
                    tokens.push({type:'OP', value:ch, lineno: lineno+1}); i++;
                }
            } else if(/\s/.test(ch)){
                i++;
            } else {
                tokens.push({type:'OP', value:ch, lineno: lineno+1}); i++;
            }
        }
        tokens.push({type:'NEWLINE', value:null, lineno: lineno+1});
    }
    while(indentStack.length>1){ indentStack.pop(); tokens.push({type:'DEDENT', value:null}); }
    tokens.push({type:'EOF'});
    return tokens;
}

// Parser
function parse(tokens){
    let pos=0;
    function peek(){ return tokens[pos]; }
    function next(){ return tokens[pos++]; }
    function accept(type, val){ const t=peek(); if(t && t.type===type && (val===undefined || t.value===val)){ return next(); } return null; }

    function parseProgram(){
        const body = [];
        while(peek().type !== 'EOF'){
            body.push(parseStatement());
        }
        return {type:'Program', body};
    }

    function consumeNewlines(){ while(peek().type==='NEWLINE') next(); }

    function parseChonBang(){ next(); const s = next(); if(s.type!=='STRING') throw new Error('chọn_bảng cần một chuỗi tên bảng'); consumeNewlines(); return {type:'ChonBang', id: s.value}; }

    function parseGán(){ next(); const target = parseExpression(); const comma = accept('OP', ','); if(!comma) throw new Error('gán cần dấu phẩy'); const expr = parseExpression(); consumeNewlines(); return {type:'Assign', target, expr}; }

    function parseDisplay(){ next(); const expr = parseExpression(); consumeNewlines(); return {type:'Display', expr}; }
    function parseReturn(){ next(); const expr = parseExpression(); consumeNewlines(); return {type:'Return', expr}; }

    function parseIf(){ next(); const cond = parseExpression(); accept('OP', ':'); consumeNewlines(); const thenBody = parseBlock(); let otherwise = null; if(peek().type==='IDENT' && peek().value==='khác'){ next(); accept('OP', ':'); consumeNewlines(); otherwise = parseBlock(); } return {type:'If', cond, thenBody, otherwise}; }

    function parseLoop(){ next(); const id = next(); if(id.type!=='IDENT') throw new Error('lặp cần tên biến'); const fromWord = next(); if(!fromWord || fromWord.type!=='IDENT' || fromWord.value!=='từ') throw new Error('lặp cú pháp: lặp i từ 1 đến N'); const start = parseExpression(); const den = next(); if(!den || den.type!=='IDENT' || den.value!=='đến') throw new Error('thiếu từ "đến"'); const end = parseExpression(); accept('OP', ':'); consumeNewlines(); const body = parseBlock(); return {type:'For', varName:id.value, start, end, body}; }

    function parseFunctionDef(){ next(); const id = next(); if(id.type!=='IDENT') throw new Error('hàm cần tên'); const args = []; if(accept('OP','(')){ while(!accept('OP',')')){ const a = next(); if(a.type!=='IDENT') throw new Error('tham số không hợp lệ'); args.push(a.value); accept('OP',','); } } accept('OP', ':'); consumeNewlines(); const body = parseBlock(); return {type:'FunctionDef', name:id.value, args, body}; }

    function parseBlock(){ if(accept('INDENT')){ const stmts=[]; while(peek().type!=='DEDENT'){ stmts.push(parseStatement()); } accept('DEDENT'); return {type:'Block', body: stmts}; } else { const s = parseStatement(); return {type:'Block', body:[s]}; } }

    function parseExprStatement(){ const e = parseExpression(); consumeNewlines(); return {type:'ExprStmt', expr: e}; }

    function parseExpression(){ return parseEquality(); }
    function parseEquality(){ let left = parseAdd(); while(peek().type==='OP' && ['==','!=','<=','>=','<','>'].includes(peek().value)){ const op = next().value; const right = parseAdd(); left = {type:'Binary', op, left, right}; } return left; }
    function parseAdd(){ let left = parseMul(); while(peek().type==='OP' && ['+','-'].includes(peek().value)){ const op = next().value; const right = parseMul(); left = {type:'Binary', op, left, right}; } return left; }
    function parseMul(){ let left = parseUnary(); while(peek().type==='OP' && ['*','/','%'].includes(peek().value)){ const op = next().value; const right = parseUnary(); left = {type:'Binary', op, left, right}; } return left; }
    function parseUnary(){ if(peek().type==='OP' && peek().value==='-'){ next(); const v = parsePrimary(); return {type:'Unary', op:'-', arg:v}; } return parsePrimary(); }
    function parsePrimary(){ const t = peek(); if(t.type==='NUMBER'){ next(); return {type:'Number', value:t.value}; } if(t.type==='STRING'){ next(); return {type:'String', value:t.value}; } if(t.type==='IDENT'){
            const idTok = next();
            if(accept('OP','(')){
                const args = [];
                if(!accept('OP',')')){
                    while(true){ args.push(parseExpression()); if(accept('OP',')')) break; accept('OP',','); }
                }
                return {type:'Call', name:idTok.value, args};
            }
            return {type:'Var', name:idTok.value};
        }
        if(t.type==='OP' && t.value==='('){ next(); const e = parseExpression(); accept('OP',')'); return e; }
        throw new Error('Unexpected primary '+JSON.stringify(t));
    }

    // parseStatement supports: keywords, assignment with '=', gán ô(...), expression statements
    function parseStatement(){
        const t = peek();
        if(t.type==='IDENT'){
            const kw = t.value;
            if(kw==='chọn_bảng') return parseChonBang();
            if(kw==='gán') return parseGán();
            if(kw==='ô') return parseExprStatement();
            if(kw==='nếu') return parseIf();
            if(kw==='lặp') return parseLoop();
            if(kw==='hàm') return parseFunctionDef();
            if(kw==='hiển_thị') return parseDisplay();
            if(kw==='trả_về') return parseReturn();
            if(kw==='gọi') return parseExprStatement();
            if(kw==='thêm_hàng' || kw==='xóa_hàng' || kw==='chèn_cột' || kw==='sắp_xếp') return parseExprStatement();

            // Assignment: variable like `x = expr`
            const nextTok = tokens[pos+1];
            if(nextTok && nextTok.type === 'OP' && nextTok.value === '='){
                const nameTok = next(); // IDENT
                next(); // consume '='
                const expr = parseExpression();
                consumeNewlines();
                return { type: 'Assign', target: { type: 'Var', name: nameTok.value }, expr };
            }

            // Assignment to a call target like `ô(1,2) = 'a'`
            if(tokens[pos+1] && tokens[pos+1].type==='OP' && tokens[pos+1].value==='('){
                let depth = 0; let i = pos+1; let found = -1;
                for(; i<tokens.length; i++){
                    const tk = tokens[i];
                    if(tk.type==='OP' && tk.value==='(') depth++;
                    if(tk.type==='OP' && tk.value===')'){ depth--; if(depth===0){ found = i; break; } }
                }
                if(found!==-1 && tokens[found+1] && tokens[found+1].type==='OP' && tokens[found+1].value==='='){
                    const target = parseExpression();
                    if(peek().type==='OP' && peek().value==='=') next();
                    const expr = parseExpression(); consumeNewlines();
                    return { type: 'Assign', target, expr };
                }
            }

            return parseExprStatement();
        } else if(t.type==='NEWLINE'){ next(); return parseStatement(); }
        else throw new Error('Không hiểu token: '+JSON.stringify(t));
    }

    return parseProgram();
}

// Interpreter
function makeRuntime(env){
    const runtime = {
        vars: Object.create(null),
        functions: Object.create(null),
        table: null,
        root: env && env.root ? env.root : document,
    };

    function ensureTableExists(){ if(!runtime.table) throw new Error('Chưa gọi chọn_bảng()'); }
    function getNumRows(){ ensureTableExists(); return runtime.table.rows.length; }
    function getNumCols(){ ensureTableExists(); return runtime.table.rows[0] ? runtime.table.rows[0].cells.length : 0; }
    function cell(r,c){ ensureTableExists(); r=Math.floor(r); c=Math.floor(c); if(r<1 || c<1) return ''; const row = runtime.table.rows[r-1]; if(!row) return ''; const cell = row.cells[c-1]; return cell? cell.innerText : ''; }
    function setCell(r,c,val){ ensureTableExists(); r=Math.floor(r); c=Math.floor(c); while(runtime.table.rows.length < r){ runtime.table.insertRow(); }
        const row = runtime.table.rows[r-1]; while(row.cells.length < c){ row.insertCell(); }
        const cell = row.cells[c-1]; cell.innerText = (val===null||val===undefined)? '': String(val);
    }
    function toNumber(v){ const n = Number(v); return isNaN(n)? 0 : n; }

    // --- HỖ TRỢ VÙNG A1 (A1, A1:E3) ---
    function colLettersToIndex(letters){
        letters = String(letters).toUpperCase();
        let n = 0;
        for(let i=0;i<letters.length;i++){
            const code = letters.charCodeAt(i) - 64;
            if(code < 1 || code > 26) return NaN;
            n = n*26 + code;
        }
        return n;
    }
    function parseA1Range(s){
        if(typeof s !== 'string') throw new Error('parseA1Range expects string like "A1" or "A1:E3"');
        s = s.trim().toUpperCase();
        if(s.indexOf(':') === -1){
            const m = s.match(/^([A-Z]+)([0-9]+)$/);
            if(!m) throw new Error('Định dạng ô không hợp lệ: '+s);
            const c = colLettersToIndex(m[1]);
            const r = parseInt(m[2],10);
            return {r1:r, c1:c, r2:r, c2:c};
        } else {
            const parts = s.split(':');
            if(parts.length !== 2) throw new Error('Định dạng vùng không hợp lệ: '+s);
            const a = parseA1Range(parts[0]);
            const b = parseA1Range(parts[1]);
            const r1 = Math.min(a.r1, b.r1), r2 = Math.max(a.r1, b.r1);
            const c1 = Math.min(a.c1, b.c1), c2 = Math.max(a.c1, b.c1);
            return {r1,c1,r2,c2};
        }
    }
    function readRangeValues(rangeStr){ const r = parseA1Range(rangeStr); const arr = []; for(let i=r.r1;i<=r.r2;i++){ for(let j=r.c1;j<=r.c2;j++){ arr.push({r:i, c:j, value: cell(i,j)}); } } return arr; }
    function writeRangeValue(rangeStr, value){ const r = parseA1Range(rangeStr); for(let i=r.r1;i<=r.r2;i++){ for(let j=r.c1;j<=r.c2;j++){ setCell(i,j,value); } } }

    const builtins = {
        'ô': function(r,c){ return cell(r,c); },
        'số_hàng': function(){ return getNumRows(); },
        'số_cột': function(){ return getNumCols(); },
        'gán_ô': function(r,c,v){ setCell(r,c,v); return null; },
        'thêm_hàng': function(pos){ ensureTableExists(); if(pos===undefined) runtime.table.insertRow(); else runtime.table.insertRow(pos-1); return null; },
        'xóa_hàng': function(pos){ ensureTableExists(); runtime.table.deleteRow(pos-1); return null; },
        'chèn_cột': function(pos){ ensureTableExists(); for(let i=0;i<getNumRows();i++){ runtime.table.rows[i].insertCell(pos-1); } return null; },
        'sắp_xếp': function(colIndex, asc){ ensureTableExists(); const rows = Array.from(runtime.table.rows); const header = rows[0]; const data = rows.slice(1); data.sort((a,b)=>{ const va = a.cells[colIndex-1]? a.cells[colIndex-1].innerText : ''; const vb = b.cells[colIndex-1]? b.cells[colIndex-1].innerText : ''; const na = Number(va), nb = Number(vb); if(!isNaN(na) && !isNaN(nb)) return (na - nb) * (asc?1:-1); return va.localeCompare(vb) * (asc?1:-1); }); for(let i=0;i<data.length;i++) runtime.table.appendChild(data[i]); return null; },
        'tổng': function(col){ let s=0; for(let i=1;i<=getNumRows(); i++){ s += toNumber(cell(i,col)); } return s; },
        'hiển_thị': function(msg){ alert(msg); return null; },
        'nhập': function(promptText){ return window.prompt(promptText); },
        'số': function(v){ return toNumber(v); },
        'vùng': function(rangeStr){ return readRangeValues(rangeStr); },
        'đặt_vùng': function(rangeStr, value){ writeRangeValue(rangeStr, value); return null; }
    };

    function evalProgram(node){ let result; for(const st of node.body){ result = evalStatement(st); if(result && result.__return) return result; } return result; }

    function evalStatement(st){
        switch(st.type){
            case 'ChonBang': runtime.table = runtime.root.getElementById(st.id); if(!runtime.table || runtime.table.tagName.toLowerCase()!=='table') throw new Error('Không tìm thấy table id="'+st.id+'"'); return null;
            case 'Assign': {
                if(st.target.type==='Call' && st.target.name==='ô'){
                    const args = st.target.args.map(arg=>evalExpression(arg)); setCell(args[0], args[1], evalExpression(st.expr)); return null;
                } else if(st.target.type==='Var'){
                    runtime.vars[st.target.name] = evalExpression(st.expr); return null;
                } else {
                    throw new Error('Gán mục tiêu không hợp lệ');
                }
            }
            case 'Display': { const v = evalExpression(st.expr); builtins.hiển_thị(v); return null; }
            case 'ExprStmt': { return evalExpression(st.expr); }
            case 'If': { const c = evalExpression(st.cond); if(c){ const r = evalBlock(st.thenBody); if(r && r.__return) return r; } else if(st.otherwise){ const r = evalBlock(st.otherwise); if(r && r.__return) return r; } return null; }
            case 'For': { const start = Math.floor(evalExpression(st.start)); const end = Math.floor(evalExpression(st.end)); for(let i=start;i<=end;i++){ runtime.vars[st.varName] = i; const r = evalBlock(st.body); if(r && r.__return) return r; } return null; }
            case 'FunctionDef': { runtime.functions[st.name] = st; return null; }
            case 'Return': { return {__return: evalExpression(st.expr)}; }
            default: throw new Error('Statement type not supported: '+st.type);
        }
    }

    function evalBlock(block){ for(const st of block.body){ const r = evalStatement(st); if(r && r.__return) return r; } return null; }

    function evalExpression(expr){
        switch(expr.type){
            case 'Number': return expr.value;
            case 'String': return expr.value;
            case 'Var': {
                if (Object.prototype.hasOwnProperty.call(runtime.vars, expr.name)) return runtime.vars[expr.name];
                if (Object.prototype.hasOwnProperty.call(runtime.functions, expr.name)) return runtime.functions[expr.name];
                return null;
            }
            case 'Unary': { const v = evalExpression(expr.arg); if(expr.op==='-') return -Number(v); return v; }
            case 'Binary': { const a = evalExpression(expr.left); const b = evalExpression(expr.right); switch(expr.op){ case '+': return (a===null? '':a) + (b===null? '':b); case '-': return Number(a) - Number(b); case '*': return Number(a) * Number(b); case '/': return Number(a) / Number(b); case '%': return Number(a) % Number(b); case '==': return String(a) === String(b); case '!=': return String(a) !== String(b); case '<=': return Number(a) <= Number(b); case '>=': return Number(a) >= Number(b); case '<': return Number(a) < Number(b); case '>': return Number(a) > Number(b); default: throw new Error('Operator '+expr.op+' chưa hỗ trợ'); } }
            case 'Call': {
                if(builtins[expr.name]){ const args = expr.args.map(a=>evalExpression(a)); return builtins[expr.name](...args); }
                const f = runtime.functions[expr.name]; if(f){ const savedVars = Object.assign({}, runtime.vars); for(let i=0;i<f.args.length;i++){ runtime.vars[f.args[i]] = expr.args[i] ? evalExpression(expr.args[i]) : null; } const r = evalBlock(f.body); runtime.vars = savedVars; if(r && r.__return) return r.__return; return null; }
                if(expr.name==='ô'){ const args = expr.args.map(a=>evalExpression(a)); return builtins['ô'](...args); }
                if(expr.name==='gán_ô'){ const args = expr.args.map(a=>evalExpression(a)); return builtins['gán_ô'](...args); }
                if(['thêm_hàng','xóa_hàng','chèn_cột','sắp_xếp','tổng','hiển_thị','nhập','số','vùng','đặt_vùng'].includes(expr.name)){ const args = expr.args.map(a=>evalExpression(a)); return builtins[expr.name](...args); }
                throw new Error('Hàm hoặc builtin không tìm thấy: '+expr.name);
            }
            default: throw new Error('Expression type unknown: '+expr.type);
        }
    }

    return { run(ast){ return evalProgram(ast); }, runtime };
}

function run(code, options){
    try{
        const tokens = lex(code);
        const ast = parse(tokens);
        const rt = makeRuntime(options||{});
        const res = rt.run(ast);
        return {ok:true, result: res};
    } catch(e){
        return {ok:false, error: e.message};
    }
}

return { run };
})();

if(typeof window !== 'undefined') window.BabelTable = BabelTable;

/*
DaTable — Ngôn ngữ lập trình tiếng Việt cho xử lý bảng và dữ liệu
Phiên bản: v4
Tác giả: Assistant
Lịch sử thay đổi:
- v1: Hỗ trợ cơ bản với bảng, biến, điều kiện, vòng lặp
- v2: Thêm hỗ trợ vùng A1, indexing mảng, toán tử logic
- v3: Thêm hỗ trợ JSON, xử lý mảng nâng cao
- v4: Thêm hàm kiểm tra phần tử, đổi tên thành DaTable

Tính năng:
- Hỗ trợ identifier Unicode (tiếng Việt)
- Hỗ trợ gán bằng '=' và gán cho ô: ô(1,2) = 'x'
- Chấp nhận ':' ở cuối header như Python
- Fix hasOwnProperty cho runtime.vars
- Hỗ trợ vùng A1, A1:E3 thông qua builtin vùng() và đặt_vùng()
- Hỗ trợ cấu trúc "khác_nếu" (else if)
- Hỗ trợ toán tử logic "và", "hoặc", "không"
- Hỗ trợ từ khóa "bỏ_qua" (continue), "nếu_không" (elif alternative)
- Hỗ trợ indexing mảng với [ ]
- Hỗ trợ hàm tìm kiếm "tìm" và "tìm_kiếm"
- Hỗ trợ xử lý mảng và JSON đầy đủ
- Hỗ trợ kiểm tra phần tử trong mảng/object

Sử dụng: DaTable.run(codeString, {root: document})
*/

const DaTable = (function(){

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
            } else if(/[,()=+\-*/<>:%\[\]{}]/.test(ch)){
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
    function parseBỏQua(){ next(); consumeNewlines(); return {type:'BỏQua'}; }

    function parseIf(){ 
        next(); 
        const cond = parseExpression(); 
        accept('OP', ':'); 
        consumeNewlines(); 
        const thenBody = parseBlock(); 
        
        // Hỗ trợ nhiều khác_nếu và nếu_không
        const elseIfs = [];
        while(peek().type==='IDENT' && (peek().value==='khác_nếu' || peek().value==='nếu_không')){ 
            next(); 
            const elseIfCond = parseExpression(); 
            accept('OP', ':'); 
            consumeNewlines(); 
            const elseIfBody = parseBlock(); 
            elseIfs.push({cond: elseIfCond, body: elseIfBody}); 
        }
        
        let otherwise = null; 
        if(peek().type==='IDENT' && peek().value==='khác'){ 
            next(); 
            accept('OP', ':'); 
            consumeNewlines(); 
            otherwise = parseBlock(); 
        } 
        
        return {type:'If', cond, thenBody, elseIfs, otherwise}; 
    }

    function parseLoop(){ next(); const id = next(); if(id.type!=='IDENT') throw new Error('lặp cần tên biến'); const fromWord = next(); if(!fromWord || fromWord.type!=='IDENT' || fromWord.value!=='từ') throw new Error('lặp cú pháp: lặp i từ 1 đến N'); const start = parseExpression(); const den = next(); if(!den || den.type!=='IDENT' || den.value!=='đến') throw new Error('thiếu từ "đến"'); const end = parseExpression(); accept('OP', ':'); consumeNewlines(); const body = parseBlock(); return {type:'For', varName:id.value, start, end, body}; }

    function parseFunctionDef(){ next(); const id = next(); if(id.type!=='IDENT') throw new Error('hàm cần tên'); const args = []; if(accept('OP','(')){ while(!accept('OP',')')){ const a = next(); if(a.type!=='IDENT') throw new Error('tham số không hợp lệ'); args.push(a.value); accept('OP',','); } } accept('OP', ':'); consumeNewlines(); const body = parseBlock(); return {type:'FunctionDef', name:id.value, args, body}; }

    function parseBlock(){ if(accept('INDENT')){ const stmts=[]; while(peek().type!=='DEDENT'){ stmts.push(parseStatement()); } accept('DEDENT'); return {type:'Block', body: stmts}; } else { const s = parseStatement(); return {type:'Block', body:[s]}; } }

    function parseExprStatement(){ const e = parseExpression(); consumeNewlines(); return {type:'ExprStmt', expr: e}; }

    function parseExpression(){ return parseAssignment(); }
    
    function parseAssignment(){
        const left = parseLogicalOr();
        if(peek().type === 'OP' && peek().value === '='){
            next();
            const right = parseAssignment();
            return {type: 'Assign', target: left, expr: right};
        }
        return left;
    }
    
    function parseLogicalOr(){
        let left = parseLogicalAnd();
        while(peek().type==='IDENT' && peek().value==='hoặc'){
            next();
            const right = parseLogicalAnd();
            left = {type:'Logical', op:'hoặc', left, right};
        }
        return left;
    }
    
    function parseLogicalAnd(){
        let left = parseEquality();
        while(peek().type==='IDENT' && peek().value==='và'){
            next();
            const right = parseEquality();
            left = {type:'Logical', op:'và', left, right};
        }
        return left;
    }
    
    function parseEquality(){ 
        let left = parseAdd(); 
        while(peek().type==='OP' && ['==','!=','<=','>=','<','>'].includes(peek().value)){ 
            const op = next().value; 
            const right = parseAdd(); 
            left = {type:'Binary', op, left, right}; 
        } 
        return left; 
    }
    
    function parseAdd(){ let left = parseMul(); while(peek().type==='OP' && ['+','-'].includes(peek().value)){ const op = next().value; const right = parseMul(); left = {type:'Binary', op, left, right}; } return left; }
    function parseMul(){ let left = parseUnary(); while(peek().type==='OP' && ['*','/','%'].includes(peek().value)){ const op = next().value; const right = parseUnary(); left = {type:'Binary', op, left, right}; } return left; }
    
    function parseUnary(){ 
        if(peek().type==='OP' && peek().value==='-'){
            next(); 
            const v = parsePrimary(); 
            return {type:'Unary', op:'-', arg:v}; 
        }
        if(peek().type==='IDENT' && peek().value==='không'){
            next();
            const v = parsePrimary();
            return {type:'Unary', op:'không', arg:v};
        }
        return parsePrimary(); 
    }
    
    function parsePrimary(){ 
        let expr = parseAtom();
        
        // Hỗ trợ indexing nhiều cấp: mảng[0], mảng[0][1], v.v.
        while(peek().type === 'OP' && peek().value === '['){
            next();
            const index = parseExpression();
            accept('OP', ']');
            expr = {type: 'Index', array: expr, index};
        }
        
        return expr;
    }
    
    function parseAtom(){
        const t = peek(); 
        if(t.type==='NUMBER'){ 
            next(); 
            return {type:'Number', value:t.value}; 
        } 
        if(t.type==='STRING'){ 
            next(); 
            return {type:'String', value:t.value}; 
        } 
        if(t.type==='IDENT'){
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
        if(t.type==='OP' && t.value==='('){ 
            next(); 
            const e = parseExpression(); 
            accept('OP',')'); 
            return e; 
        }
        if(t.type==='OP' && t.value==='['){
            next();
            const elements = [];
            if(!accept('OP',']')){
                while(true){
                    elements.push(parseExpression());
                    if(accept('OP',']')) break;
                    accept('OP',',');
                }
            }
            return {type:'Array', elements};
        }
        if(t.type==='OP' && t.value==='{'){
            next();
            const properties = [];
            if(!accept('OP','}')){
                while(true){
                    const key = parseExpression();
                    if(peek().type==='OP' && peek().value===':'){
                        next();
                        const value = parseExpression();
                        properties.push({key, value});
                    } else {
                        throw new Error('Thiếu dấu : trong object');
                    }
                    if(accept('OP','}')) break;
                    accept('OP',',');
                }
            }
            return {type:'Object', properties};
        }
        throw new Error('Unexpected atom '+JSON.stringify(t));
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
            if(kw==='bỏ_qua') return parseBỏQua();
            if(kw==='gọi') return parseExprStatement();
            if(kw==='thêm_hàng' || kw==='xóa_hàng' || kw==='chèn_cột' || kw==='sắp_xếp') return parseExprStatement();
            
            // Thêm nhận diện khác_nếu (mặc dù nó được xử lý trong parseIf)
            if(kw==='khác_nếu' || kw==='nếu_không' || kw==='khác') {
                // Các từ khóa này chỉ được xử lý trong ngữ cảnh của if
                throw new Error('"'+kw+'" phải nằm sau khối "nếu"');
            }

            // Assignment: variable like `x = expr`
            const nextTok = tokens[pos+1];
            if(nextTok && nextTok.type === 'OP' && nextTok.value === '='){
                const nameTok = next(); // IDENT
                next(); // consume '='
                const expr = parseExpression();
                consumeNewlines();
                return { type: 'Assign', target: { type: 'Var', name: nameTok.value }, expr };
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
        clipboard: null
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
    function toBoolean(v){ 
        if(v === null || v === undefined || v === false) return false;
        if(typeof v === 'number') return v !== 0;
        if(typeof v === 'string') return v !== '';
        if(Array.isArray(v)) return v.length > 0;
        return true;
    }

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
    
    // Sửa hàm readRangeValues để trả về mảng các giá trị chữ thay vì object
    function readRangeValues(rangeStr){ 
        const r = parseA1Range(rangeStr); 
        const arr = []; 
        for(let i=r.r1;i<=r.r2;i++){ 
            const row = [];
            for(let j=r.c1;j<=r.c2;j++){ 
                row.push(cell(i,j));
            }
            // Nếu chỉ có 1 cột, trả về mảng 1 chiều, ngược lại trả về mảng 2 chiều
            if(r.c1 === r.c2) {
                arr.push(...row);
            } else {
                arr.push(row);
            }
        } 
        return arr; 
    }
    
    // Hàm ghi mảng dữ liệu vào vùng
    function writeRangeData(rangeStr, data){ 
        const r = parseA1Range(rangeStr);
        if(!Array.isArray(data)) {
            // Nếu data không phải mảng, ghi cùng giá trị cho tất cả ô
            for(let i=r.r1;i<=r.r2;i++){ 
                for(let j=r.c1;j<=r.c2;j++){ 
                    setCell(i,j,data);
                }
            }
            return;
        }
        
        let dataIndex = 0;
        for(let i=r.r1;i<=r.r2;i++){ 
            if(dataIndex >= data.length) break;
            
            const rowData = data[dataIndex];
            if(Array.isArray(rowData)) {
                // Data là mảng 2 chiều
                for(let j=r.c1; j<=r.c2 && (j-r.c1) < rowData.length; j++) {
                    setCell(i, j, rowData[j - r.c1]);
                }
            } else {
                // Data là mảng 1 chiều
                for(let j=r.c1; j<=r.c2 && dataIndex < data.length; j++) {
                    setCell(i, j, data[dataIndex]);
                    dataIndex++;
                }
                continue; // Tiếp tục vòng lặp hàng
            }
            dataIndex++;
        }
    }
    
    function writeRangeValue(rangeStr, value){ 
        const r = parseA1Range(rangeStr); 
        for(let i=r.r1;i<=r.r2;i++){ 
            for(let j=r.c1;j<=r.c2;j++){ 
                setCell(i,j,value); 
            }
        } 
    }

    // --- HÀM XỬ LÝ MẢNG ---
    function arrayMap(arr, callback) {
        if(!Array.isArray(arr)) return [];
        const result = [];
        for(let i = 0; i < arr.length; i++) {
            result.push(callback(arr[i], i, arr));
        }
        return result;
    }

    function arrayFilter(arr, callback) {
        if(!Array.isArray(arr)) return [];
        const result = [];
        for(let i = 0; i < arr.length; i++) {
            if(callback(arr[i], i, arr)) {
                result.push(arr[i]);
            }
        }
        return result;
    }

    function arrayReduce(arr, callback, initialValue) {
        if(!Array.isArray(arr)) return initialValue;
        let accumulator = initialValue;
        for(let i = 0; i < arr.length; i++) {
            accumulator = callback(accumulator, arr[i], i, arr);
        }
        return accumulator;
    }

    function arrayFind(arr, callback) {
        if(!Array.isArray(arr)) return null;
        for(let i = 0; i < arr.length; i++) {
            if(callback(arr[i], i, arr)) {
                return arr[i];
            }
        }
        return null;
    }

    function arraySome(arr, callback) {
        if(!Array.isArray(arr)) return false;
        for(let i = 0; i < arr.length; i++) {
            if(callback(arr[i], i, arr)) {
                return true;
            }
        }
        return false;
    }

    function arrayEvery(arr, callback) {
        if(!Array.isArray(arr)) return true;
        for(let i = 0; i < arr.length; i++) {
            if(!callback(arr[i], i, arr)) {
                return false;
            }
        }
        return true;
    }

    function arraySort(arr, compareFn) {
        if(!Array.isArray(arr)) return [];
        const newArr = [...arr];
        if(compareFn) {
            return newArr.sort((a, b) => {
                const result = compareFn(a, b);
                return typeof result === 'number' ? result : result ? 1 : -1;
            });
        }
        return newArr.sort();
    }

    function arrayFlat(arr, depth = 1) {
        if(!Array.isArray(arr)) return [];
        if(depth <= 0) return arr;
        const result = [];
        for(const item of arr) {
            if(Array.isArray(item)) {
                result.push(...arrayFlat(item, depth - 1));
            } else {
                result.push(item);
            }
        }
        return result;
    }

    function arrayGroupBy(arr, keyFn) {
        if(!Array.isArray(arr)) return {};
        const result = {};
        for(const item of arr) {
            const key = keyFn(item);
            if(!result[key]) {
                result[key] = [];
            }
            result[key].push(item);
        }
        return result;
    }

    function arrayIncludes(arr, searchElement, fromIndex = 0) {
        if(!Array.isArray(arr)) return false;
        for(let i = fromIndex; i < arr.length; i++) {
            if(arr[i] === searchElement) {
                return true;
            }
        }
        return false;
    }

    function arrayIndexOf(arr, searchElement, fromIndex = 0) {
        if(!Array.isArray(arr)) return -1;
        for(let i = fromIndex; i < arr.length; i++) {
            if(arr[i] === searchElement) {
                return i;
            }
        }
        return -1;
    }

    // --- HÀM XỬ LÝ JSON ---
    function safeJsonParse(str) {
        try {
            return JSON.parse(str);
        } catch(e) {
            return null;
        }
    }

    function safeJsonStringify(obj) {
        try {
            return JSON.stringify(obj);
        } catch(e) {
            return null;
        }
    }

    function deepClone(obj) {
        if(obj === null || typeof obj !== 'object') return obj;
        if(Array.isArray(obj)) return obj.map(item => deepClone(item));
        const cloned = {};
        for(const key in obj) {
            if(obj.hasOwnProperty(key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }

    function getByPath(obj, path) {
        if(!obj || typeof obj !== 'object') return undefined;
        const keys = path.split('.');
        let current = obj;
        for(const key of keys) {
            if(current === null || current === undefined) return undefined;
            current = current[key];
        }
        return current;
    }

    function setByPath(obj, path, value) {
        if(!obj || typeof obj !== 'object') return false;
        const keys = path.split('.');
        let current = obj;
        for(let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if(current[key] === null || current[key] === undefined) {
                current[key] = {};
            }
            current = current[key];
        }
        current[keys[keys.length - 1]] = value;
        return true;
    }

    function filterObject(obj, callback) {
        if(!obj || typeof obj !== 'object') return {};
        const result = {};
        for(const key in obj) {
            if(obj.hasOwnProperty(key) && callback(obj[key], key, obj)) {
                result[key] = obj[key];
            }
        }
        return result;
    }

    function mapObject(obj, callback) {
        if(!obj || typeof obj !== 'object') return {};
        const result = {};
        for(const key in obj) {
            if(obj.hasOwnProperty(key)) {
                result[key] = callback(obj[key], key, obj);
            }
        }
        return result;
    }

    function objectHas(obj, key) {
        if(!obj || typeof obj !== 'object') return false;
        return obj.hasOwnProperty(key);
    }

    function objectIncludes(obj, value) {
        if(!obj || typeof obj !== 'object') return false;
        for(const key in obj) {
            if(obj.hasOwnProperty(key) && obj[key] === value) {
                return true;
            }
        }
        return false;
    }

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
        'hiển_thị': function(msg){ 
            // Hiển thị đúng định dạng cho mảng và object
            if(Array.isArray(msg)) {
                alert(JSON.stringify(msg));
            } else if(typeof msg === 'object' && msg !== null) {
                alert(JSON.stringify(msg));
            } else {
                alert(String(msg));
            }
            return null; 
        },
        'nhập': function(promptText){ return window.prompt(promptText); },
        'số': function(v){ return toNumber(v); },
        'vùng': function(rangeStr){ return readRangeValues(rangeStr); },
        'đặt_vùng': function(rangeStr, value){ 
            if(Array.isArray(value)) {
                writeRangeData(rangeStr, value);
            } else {
                writeRangeValue(rangeStr, value); 
            }
            return null; 
        },
        'độ_dài': function(x){ 
            if(x === null || x === undefined) return 0;
            if(Array.isArray(x) || typeof x === 'string') return x.length;
            return 0;
        },

        // --- HÀM XỬ LÝ MẢNG ---
        'ánh_xạ': function(arr, callback) {
            if(typeof callback === 'string') {
                // Hỗ trợ chuỗi biểu thức đơn giản
                const fn = new Function('x', 'i', 'arr', `return ${callback}`);
                return arrayMap(arr, fn);
            }
            return arrayMap(arr, callback);
        },
        'lọc': function(arr, callback) {
            if(typeof callback === 'string') {
                const fn = new Function('x', 'i', 'arr', `return ${callback}`);
                return arrayFilter(arr, fn);
            }
            return arrayFilter(arr, callback);
        },
        'gộp': function(arr, callback, initialValue) {
            if(typeof callback === 'string') {
                const fn = new Function('total', 'current', 'i', 'arr', `return ${callback}`);
                return arrayReduce(arr, fn, initialValue);
            }
            return arrayReduce(arr, callback, initialValue);
        },
        'tìm': function(arr, callback) {
            if(typeof callback === 'string') {
                const fn = new Function('x', 'i', 'arr', `return ${callback}`);
                return arrayFind(arr, fn);
            }
            return arrayFind(arr, callback);
        },
        'một_số': function(arr, callback) {
            if(typeof callback === 'string') {
                const fn = new Function('x', 'i', 'arr', `return ${callback}`);
                return arraySome(arr, fn);
            }
            return arraySome(arr, callback);
        },
        'mọi': function(arr, callback) {
            if(typeof callback === 'string') {
                const fn = new Function('x', 'i', 'arr', `return ${callback}`);
                return arrayEvery(arr, fn);
            }
            return arrayEvery(arr, callback);
        },
        'sắp_xếp_mảng': function(arr, compareFn) {
            return arraySort(arr, compareFn);
        },
        'làm_phẳng': function(arr, depth) {
            return arrayFlat(arr, depth);
        },
        'nhóm_theo': function(arr, keyFn) {
            if(typeof keyFn === 'string') {
                const fn = new Function('x', `return x.${keyFn}`);
                return arrayGroupBy(arr, fn);
            }
            return arrayGroupBy(arr, keyFn);
        },
        'nối': function(...arrays) {
            return arrays.flat().filter(x => Array.isArray(x)).reduce((acc, curr) => acc.concat(curr), []);
        },
        'cắt': function(arr, start, end) {
            return Array.isArray(arr) ? arr.slice(start, end) : [];
        },
        'thêm_vào_đầu': function(arr, ...items) {
            if(!Array.isArray(arr)) return items;
            arr.unshift(...items);
            return arr;
        },
        'thêm_vào_cuối': function(arr, ...items) {
            if(!Array.isArray(arr)) return items;
            arr.push(...items);
            return arr;
        },
        'xóa_đầu': function(arr) {
            if(!Array.isArray(arr)) return null;
            return arr.shift();
        },
        'xóa_cuối': function(arr) {
            if(!Array.isArray(arr)) return null;
            return arr.pop();
        },
        'chèn': function(arr, index, ...items) {
            if(!Array.isArray(arr)) return items;
            arr.splice(index, 0, ...items);
            return arr;
        },
        'xóa_vị_trí': function(arr, index, count = 1) {
            if(!Array.isArray(arr)) return [];
            return arr.splice(index, count);
        },
        'chứa': function(arr, element, fromIndex = 0) {
            return arrayIncludes(arr, element, fromIndex);
        },
        'vị_trí': function(arr, element, fromIndex = 0) {
            return arrayIndexOf(arr, element, fromIndex);
        },

        // --- HÀM XỬ LÝ JSON ---
        'json_chuỗi': function(obj) {
            return safeJsonStringify(obj);
        },
        'json_phân_tích': function(str) {
            return safeJsonParse(str);
        },
        'json_sao_chép': function(obj) {
            return deepClone(obj);
        },
        'là_json': function(x) {
            return x !== null && typeof x === 'object';
        },
        'là_chuỗi_json': function(str) {
            try {
                JSON.parse(str);
                return true;
            } catch(e) {
                return false;
            }
        },
        'lấy_đường_dẫn': function(obj, path) {
            return getByPath(obj, path);
        },
        'đặt_đường_dẫn': function(obj, path, value) {
            return setByPath(obj, path, value);
        },
        'lọc_đối_tượng': function(obj, callback) {
            if(typeof callback === 'string') {
                const fn = new Function('value', 'key', 'obj', `return ${callback}`);
                return filterObject(obj, fn);
            }
            return filterObject(obj, callback);
        },
        'ánh_xạ_đối_tượng': function(obj, callback) {
            if(typeof callback === 'string') {
                const fn = new Function('value', 'key', 'obj', `return ${callback}`);
                return mapObject(obj, fn);
            }
            return mapObject(obj, callback);
        },
        'khóa': function(obj) {
            if(!obj || typeof obj !== 'object') return [];
            return Object.keys(obj);
        },
        'giá_trị': function(obj) {
            if(!obj || typeof obj !== 'object') return [];
            return Object.values(obj);
        },
        'mục': function(obj) {
            if(!obj || typeof obj !== 'object') return [];
            return Object.entries(obj);
        },
        'có_khóa': function(obj, key) {
            return objectHas(obj, key);
        },
        'có_giá_trị': function(obj, value) {
            return objectIncludes(obj, value);
        },

        // Hàm tìm kiếm trong bảng
        'tìm': function(searchValue, searchRange, resultRange) {
            ensureTableExists();
            const range = parseA1Range(searchRange);
            const results = [];
            
            // Tìm kiếm trong vùng
            for(let i=range.r1; i<=range.r2; i++) {
                for(let j=range.c1; j<=range.c2; j++) {
                    const cellValue = cell(i, j);
                    if(String(cellValue).includes(String(searchValue))) {
                        results.push({row: i, col: j, value: cellValue});
                    }
                }
            }
            
            // Nếu có chỉ định vùng kết quả, ghi kết quả
            if(resultRange) {
                const resultRangeParsed = parseA1Range(resultRange);
                let resultIndex = 0;
                
                for(let i=resultRangeParsed.r1; i<=resultRangeParsed.r2 && resultIndex < results.length; i++) {
                    for(let j=resultRangeParsed.c1; j<=resultRangeParsed.c2 && resultIndex < results.length; j++) {
                        const result = results[resultIndex];
                        setCell(i, j, `H${result.row}C${result.col}: ${result.value}`);
                        resultIndex++;
                    }
                }
            }
            
            return results;
        },
        // Hàm tìm kiếm trong mảng
        'tìm_kiếm': function(array, searchValue, exactMatch) {
            if(!Array.isArray(array)) return [];
            
            const results = [];
            const searchStr = String(searchValue).toLowerCase();
            const useExactMatch = exactMatch === true;
            
            function searchInArray(arr, path) {
                for(let i = 0; i < arr.length; i++) {
                    const item = arr[i];
                    const currentPath = path ? `${path}[${i}]` : `[${i}]`;
                    
                    if(Array.isArray(item)) {
                        searchInArray(item, currentPath);
                    } else {
                        const itemStr = String(item).toLowerCase();
                        let found = false;
                        
                        if(useExactMatch) {
                            found = itemStr === searchStr;
                        } else {
                            found = itemStr.includes(searchStr);
                        }
                        
                        if(found) {
                            results.push({
                                value: item,
                                path: currentPath,
                                index: i
                            });
                        }
                    }
                }
            }
            
            searchInArray(array, '');
            return results;
        },
        // string/array helpers
        'chia': function(str, sep){ 
            if(str === null || str === undefined) return []; 
            return String(str).split(sep===undefined ? '' : String(sep)); 
        },
        'thay_thế': function(str, search, replace){ 
            if(str === null || str === undefined) return ''; 
            try{
                if(typeof search === 'string' && search !== ''){
                    const esc = search.replace("/[.*+?^${}()|[\]\]/g", '\$&');
                    return String(str).replace(new RegExp(esc, 'g'), replace===undefined ? '' : String(replace));
                }
                return String(str).split(search).join(replace===undefined ? '' : String(replace));
            }catch(e){
                return String(str).replace(String(search), replace===undefined ? '' : String(replace));
            }
        },
        'đếm': function(subject, sub){ 
            if(Array.isArray(subject)) return subject.length;
            if(subject === null || subject === undefined) return 0;
            subject = String(subject);
            if(sub === undefined || sub === null || sub === '') return subject.length;
            sub = String(sub);
            if(sub === '') return subject.length + 1;
            let count = 0; let pos = 0;
            while(true){
                const idx = subject.indexOf(sub, pos);
                if(idx === -1) break;
                count++; pos = idx + sub.length;
            }
            return count;
        },
        // copy & paste ranges: save into runtime.clipboard (2D array) and paste to target
        'sao_chep_vùng': function(rangeStr){ 
            const r = parseA1Range(rangeStr);
            const rows = [];
            for(let i=r.r1;i<=r.r2;i++){
                const row = [];
                for(let j=r.c1;j<=r.c2;j++){
                    row.push(cell(i,j));
                }
                rows.push(row);
            }
            runtime.clipboard = { rows: rows, height: rows.length, width: rows[0] ? rows[0].length : 0 };
            return runtime.clipboard;
        },
        'dán_vùng': function(startA1, targetCol){ 
            let destRow = 1, destCol = 1;
            if(typeof startA1 === 'string'){ const parsed = parseA1Range(startA1); destRow = parsed.r1; destCol = parsed.c1; }
            else if(typeof startA1 === 'number' && typeof targetCol === 'number'){ destRow = startA1; destCol = targetCol; }
            if(!runtime.clipboard || !runtime.clipboard.rows) return null;
            for(let i=0;i<runtime.clipboard.height;i++){
                for(let j=0;j<runtime.clipboard.width;j++){
                    setCell(destRow + i, destCol + j, runtime.clipboard.rows[i][j]);
                }
            }
            return null;
        },
    };

    function evalProgram(node){ let result; for(const st of node.body){ result = evalStatement(st); if(result && result.__return) return result; } return result; }

    function evalStatement(st){
        switch(st.type){
            case 'ChonBang': runtime.table = runtime.root.getElementById(st.id); if(!runtime.table || runtime.table.tagName.toLowerCase()!=='table') throw new Error('Không tìm thấy table id="'+st.id+'"'); return null;
            case 'Assign': {
                // Hỗ trợ gán cho biến và indexing
                if(st.target.type === 'Var') {
                    runtime.vars[st.target.name] = evalExpression(st.expr);
                    return null;
                } else if(st.target.type === 'Index') {
                    // Gán cho phần tử mảng: mảng[0] = giá_trị
                    const arrayExpr = st.target.array;
                    const index = Math.floor(evalExpression(st.target.index));
                    const value = evalExpression(st.expr);
                    
                    // Đánh giá mảng (có thể là biến hoặc kết quả của biểu thức khác)
                    let array;
                    if(arrayExpr.type === 'Var') {
                        array = runtime.vars[arrayExpr.name];
                    } else {
                        array = evalExpression(arrayExpr);
                    }
                    
                    if(Array.isArray(array) && index >= 0 && index < array.length) {
                        array[index] = value;
                        // Cập nhật lại biến nếu cần
                        if(arrayExpr.type === 'Var') {
                            runtime.vars[arrayExpr.name] = array;
                        }
                        return null;
                    } else {
                        throw new Error('Index vượt quá giới hạn mảng');
                    }
                } else if(st.target.type==='Call' && st.target.name==='ô'){
                    const args = st.target.args.map(arg=>evalExpression(arg)); 
                    setCell(args[0], args[1], evalExpression(st.expr)); 
                    return null;
                } else {
                    throw new Error('Gán mục tiêu không hợp lệ');
                }
            }
            case 'Display': { const v = evalExpression(st.expr); builtins.hiển_thị(v); return null; }
            case 'ExprStmt': { 
                const result = evalExpression(st.expr);
                return result; 
            }
            case 'BỏQua': { return {__bỏ_qua: true}; }
            case 'If': { 
                const c = evalExpression(st.cond); 
                if(toBoolean(c)){ 
                    const r = evalBlock(st.thenBody); 
                    if(r && r.__return) return r;
                    if(r && r.__bỏ_qua) return r;
                } else {
                    // Xử lý các khối khác_nếu
                    let found = false;
                    for(const elseIf of st.elseIfs){
                        const elseIfCond = evalExpression(elseIf.cond);
                        if(toBoolean(elseIfCond)){
                            const r = evalBlock(elseIf.body);
                            if(r && r.__return) return r;
                            if(r && r.__bỏ_qua) return r;
                            found = true;
                            break;
                        }
                    }
                    // Nếu không có khác_nếu nào đúng, chạy khối khác
                    if(!found && st.otherwise){ 
                        const r = evalBlock(st.otherwise); 
                        if(r && r.__return) return r;
                        if(r && r.__bỏ_qua) return r;
                    }
                }
                return null; 
            }
            case 'For': { 
                const start = Math.floor(evalExpression(st.start)); 
                const end = Math.floor(evalExpression(st.end)); 
                for(let i=start;i<=end;i++){ 
                    runtime.vars[st.varName] = i; 
                    const r = evalBlock(st.body); 
                    if(r && r.__return) return r;
                    if(r && r.__bỏ_qua) continue;
                } 
                return null; 
            }
            case 'FunctionDef': { runtime.functions[st.name] = st; return null; }
            case 'Return': { return {__return: evalExpression(st.expr)}; }
            default: throw new Error('Statement type not supported: '+st.type);
        }
    }

    function evalBlock(block){ for(const st of block.body){ const r = evalStatement(st); if(r && (r.__return || r.__bỏ_qua)) return r; } return null; }

    function evalExpression(expr){
        switch(expr.type){
            case 'Number': return expr.value;
            case 'String': return expr.value;
            case 'Array': return expr.elements.map(e => evalExpression(e));
            case 'Object': {
                const obj = {};
                for(const prop of expr.properties) {
                    const key = evalExpression(prop.key);
                    const value = evalExpression(prop.value);
                    obj[key] = value;
                }
                return obj;
            }
            case 'Var': {
                if (Object.prototype.hasOwnProperty.call(runtime.vars, expr.name)) return runtime.vars[expr.name];
                if (Object.prototype.hasOwnProperty.call(runtime.functions, expr.name)) return runtime.functions[expr.name];
                return null;
            }
            case 'Index': {
                const array = evalExpression(expr.array);
                const index = Math.floor(evalExpression(expr.index));
                if(Array.isArray(array) && index >= 0 && index < array.length){
                    return array[index];
                } else if(array && typeof array === 'object' && array !== null) {
                    return array[index];
                }
                return null;
            }
            case 'Unary': { 
                const v = evalExpression(expr.arg); 
                if(expr.op==='-') return -Number(v); 
                if(expr.op==='không') return !toBoolean(v);
                return v; 
            }
            case 'Logical': {
                const left = evalExpression(expr.left);
                if(expr.op === 'hoặc'){
                    return toBoolean(left) ? left : evalExpression(expr.right);
                }
                if(expr.op === 'và'){
                    return toBoolean(left) ? evalExpression(expr.right) : left;
                }
                throw new Error('Toán tử logic không hỗ trợ: '+expr.op);
            }
            case 'Binary': { 
                const a = evalExpression(expr.left); 
                const b = evalExpression(expr.right); 
                switch(expr.op){ 
                    case '+': return (a===null? '':a) + (b===null? '':b); 
                    case '-': return Number(a) - Number(b); 
                    case '*': return Number(a) * Number(b); 
                    case '/': return Number(a) / Number(b); 
                    case '%': return Number(a) % Number(b); 
                    case '==': return String(a) === String(b); 
                    case '!=': return String(a) !== String(b); 
                    case '<=': return Number(a) <= Number(b); 
                    case '>=': return Number(a) >= Number(b); 
                    case '<': return Number(a) < Number(b); 
                    case '>': return Number(a) > Number(b); 
                    default: throw new Error('Operator '+expr.op+' chưa hỗ trợ'); 
                } 
            }
            case 'Assign': {
                // Xử lý phép gán trong biểu thức: x = y, mảng[i] = giá_trị
                if(expr.target.type === 'Var') {
                    const value = evalExpression(expr.expr);
                    runtime.vars[expr.target.name] = value;
                    return value;
                } else if(expr.target.type === 'Index') {
                    // Gán cho phần tử mảng: mảng[0] = giá_trị
                    const arrayExpr = expr.target.array;
                    const index = Math.floor(evalExpression(expr.target.index));
                    const value = evalExpression(expr.expr);
                    
                    // Đánh giá mảng (có thể là biến hoặc kết quả của biểu thức khác)
                    let array;
                    if(arrayExpr.type === 'Var') {
                        array = runtime.vars[arrayExpr.name];
                    } else {
                        array = evalExpression(arrayExpr);
                    }
                    
                    if(Array.isArray(array) && index >= 0 && index < array.length) {
                        array[index] = value;
                        // Cập nhật lại biến nếu cần
                        if(arrayExpr.type === 'Var') {
                            runtime.vars[arrayExpr.name] = array;
                        }
                        return value;
                    } else if(array && typeof array === 'object' && array !== null) {
                        // Gán cho thuộc tính object
                        array[index] = value;
                        if(arrayExpr.type === 'Var') {
                            runtime.vars[arrayExpr.name] = array;
                        }
                        return value;
                    } else {
                        throw new Error('Index vượt quá giới hạn mảng/object');
                    }
                } else if(expr.target.type==='Call' && expr.target.name==='ô'){
                    const args = expr.target.args.map(arg=>evalExpression(arg)); 
                    const value = evalExpression(expr.expr);
                    setCell(args[0], args[1], value);
                    return value;
                } else {
                    throw new Error('Gán mục tiêu không hợp lệ');
                }
            }
            case 'Call': {
                if(builtins[expr.name]){ const args = expr.args.map(a=>evalExpression(a)); return builtins[expr.name](...args); }
                const f = runtime.functions[expr.name]; if(f){ const savedVars = Object.assign({}, runtime.vars); for(let i=0;i<f.args.length;i++){ runtime.vars[f.args[i]] = expr.args[i] ? evalExpression(expr.args[i]) : null; } const r = evalBlock(f.body); runtime.vars = savedVars; if(r && r.__return) return r.__return; return null; }
                if(expr.name==='ô'){ const args = expr.args.map(a=>evalExpression(a)); return builtins['ô'](...args); }
                if(expr.name==='gán_ô'){ const args = expr.args.map(a=>evalExpression(a)); return builtins['gán_ô'](...args); }
                if(['thêm_hàng','xóa_hàng','chèn_cột','sắp_xếp','tổng','hiển_thị','nhập','số','vùng','đặt_vùng','tìm','tìm_kiếm','độ_dài','ánh_xạ','lọc','gộp','tìm','một_số','mọi','sắp_xếp_mảng','làm_phẳng','nhóm_theo','nối','cắt','thêm_vào_đầu','thêm_vào_cuối','xóa_đầu','xóa_cuối','chèn','xóa_vị_trí','chứa','vị_trí','json_chuỗi','json_phân_tích','json_sao_chép','là_json','là_chuỗi_json','lấy_đường_dẫn','đặt_đường_dẫn','lọc_đối_tượng','ánh_xạ_đối_tượng','khóa','giá_trị','mục','có_khóa','có_giá_trị'].includes(expr.name)){ const args = expr.args.map(a=>evalExpression(a)); return builtins[expr.name](...args); }
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

if(typeof window !== 'undefined') window.DaTable = DaTable;
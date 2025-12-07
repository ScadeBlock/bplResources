// datable-monaco-language.js

// Đăng ký ngôn ngữ DaTable với Monaco Editor
monaco.languages.register({ id: 'datable' });

// Định nghĩa tokenizer và cấu hình cho ngôn ngữ
monaco.languages.setMonarchTokensProvider('datable', {
  // Các từ khóa
  keywords: [
    'nếu', 'khác_nếu', 'khác', 'nếu_không', 'lặp', 'từ', 'đến', 'hàm', 
    'trả_về', 'bỏ_qua', 'chọn_bảng', 'gán', 'hiển_thị', 'gọi'
  ],

  // Các builtin functions
  builtinFunctions: [
    'ô', 'số_hàng', 'số_cột', 'gán_ô', 'thêm_hàng', 'xóa_hàng', 'chèn_cột',
    'sắp_xếp', 'tổng', 'nhập', 'số', 'vùng', 'đặt_vùng', 'độ_dài', 'tìm',
    'tìm_kiếm', 'chia', 'thay_thế', 'đếm', 'sao_chep_vùng', 'dán_vùng',
    'ánh_xạ', 'lọc', 'gộp', 'một_số', 'mọi', 'sắp_xếp_mảng', 'làm_phẳng',
    'nhóm_theo', 'nối', 'cắt', 'thêm_vào_đầu', 'thêm_vào_cuối', 'xóa_đầu',
    'xóa_cuối', 'chèn', 'xóa_vị_trí', 'chứa', 'vị_trí', 'json_chuỗi',
    'json_phân_tích', 'json_sao_chép', 'là_json', 'là_chuỗi_json',
    'lấy_đường_dẫn', 'đặt_đường_dẫn', 'lọc_đối_tượng', 'ánh_xạ_đối_tượng',
    'khóa', 'giá_trị', 'mục', 'có_khóa', 'có_giá_trị'
  ],

  // Các toán tử
  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', 
    '++', '--', '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '>>>',
    '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=', '>>>='
  ],

  // Các ký hiệu
  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  // Các từ khóa toán tử logic
  logicalOperators: ['và', 'hoặc', 'không'],

  // Tokenizer
  tokenizer: {
    root: [
      // Comments
      [/#.*$/, 'comment'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'],  // non-terminated string
      [/'([^'\\]|\\.)*$/, 'string.invalid'],  // non-terminated string
      [/"/, 'string', '@string_double'],
      [/'/, 'string', '@string_single'],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],

      // Identifiers and keywords
      [
        /[a-zA-Z_àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zA-Z0-9_àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@logicalOperators': 'keyword.operator',
            '@builtinFunctions': 'function',
            '@default': 'identifier'
          }
        }
      ],

      // Operators
      [/[{}()\[\]]/, '@brackets'],
      [
        /@symbols/,
        {
          cases: {
            '@operators': 'operator',
            '@default': ''
          }
        }
      ],

      // Whitespace
      { include: '@whitespace' }
    ],

    string_double: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop']
    ],

    string_single: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, 'string', '@pop']
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/#.*$/, 'comment']
    ]
  }
});

// Định nghĩa cấu hình autocomplete
monaco.languages.registerCompletionItemProvider('datable', {
  provideCompletionItems: function(model, position) {
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn
    };

    // Danh sách từ khóa
    const keywords = [
      { label: 'nếu', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Câu lệnh điều kiện' },
      { label: 'khác_nếu', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Điều kiện else if' },
      { label: 'khác', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Khối else' },
      { label: 'lặp', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Vòng lặp for' },
      { label: 'từ', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Từ khóa trong vòng lặp' },
      { label: 'đến', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Từ khóa trong vòng lặp' },
      { label: 'hàm', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Định nghĩa hàm' },
      { label: 'trả_về', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Trả về giá trị từ hàm' },
      { label: 'bỏ_qua', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Bỏ qua vòng lặp hiện tại' },
      { label: 'chọn_bảng', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Chọn bảng để làm việc' },
      { label: 'gán', kind: monaco.languages.CompletionItemKind.Keyword, documentation: 'Gán giá trị' }
    ];

    // Danh sách builtin functions
    const builtinFunctions = [
      { label: 'ô', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Truy cập ô: ô(hàng, cột)' },
      { label: 'số_hàng', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Lấy số hàng trong bảng' },
      { label: 'số_cột', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Lấy số cột trong bảng' },
      { label: 'gán_ô', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Gán giá trị cho ô: gán_ô(hàng, cột, giá_trị)' },
      { label: 'vùng', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Đọc vùng: vùng("A1:C3")' },
      { label: 'đặt_vùng', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Ghi vùng: đặt_vùng("A1:C3", giá_trị)' },
      { label: 'hiển_thị', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Hiển thị hộp thoại' },
      { label: 'nhập', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Nhập dữ liệu từ người dùng' },
      { label: 'số', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Chuyển đổi thành số' },
      { label: 'độ_dài', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Lấy độ dài mảng/chuỗi' },
      { label: 'tìm', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Tìm kiếm trong bảng' },
      { label: 'tìm_kiếm', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Tìm kiếm trong mảng' },
      { label: 'ánh_xạ', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Ánh xạ mảng: ánh_xạ(mảng, hàm)' },
      { label: 'lọc', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Lọc mảng: lọc(mảng, điều_kiện)' },
      { label: 'gộp', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Gộp mảng: gộp(mảng, hàm, giá_trị_đầu)' },
      { label: 'chứa', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Kiểm tra phần tử trong mảng: chứa(mảng, phần_tử)' },
      { label: 'json_chuỗi', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Chuyển object thành chuỗi JSON' },
      { label: 'json_phân_tích', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Phân tích chuỗi JSON thành object' },
      { label: 'có_khóa', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Kiểm tra key trong object: có_khóa(object, key)' },
      { label: 'có_giá_trị', kind: monaco.languages.CompletionItemKind.Function, documentation: 'Kiểm tra value trong object: có_giá_trị(object, value)' }
    ];

    // Toán tử logic
    const logicalOperators = [
      { label: 'và', kind: monaco.languages.CompletionItemKind.Operator, documentation: 'Toán tử AND' },
      { label: 'hoặc', kind: monaco.languages.CompletionItemKind.Operator, documentation: 'Toán tử OR' },
      { label: 'không', kind: monaco.languages.CompletionItemKind.Operator, documentation: 'Toán tử NOT' }
    ];

    // Tất cả suggestions
    const suggestions = [...keywords, ...builtinFunctions, ...logicalOperators];

    return {
      suggestions: suggestions.map(suggestion => ({
        ...suggestion,
        range: range,
        insertText: suggestion.label
      }))
    };
  }
});

// Định nghĩa cấu hình hover (tooltip)
monaco.languages.registerHoverProvider('datable', {
  provideHover: function(model, position) {
    const word = model.getWordAtPosition(position);
    
    if (!word) {
      return null;
    }

    const wordText = word.word;

    // Documentation cho từ khóa
    const keywordDocs = {
      'nếu': 'Câu lệnh điều kiện\n```datable\nnếu điều_kiện:\n    # khối lệnh\n```',
      'khác_nếu': 'Điều kiện else if\n```datable\nnếu điều_kiện1:\n    # khối 1\nkhác_nếu điều_kiện2:\n    # khối 2\n```',
      'khác': 'Khối else\n```datable\nnếu điều_kiện:\n    # khối if\nkhác:\n    # khối else\n```',
      'lặp': 'Vòng lặp for\n```datable\nlặp i từ 1 đến 10:\n    # khối lệnh\n```',
      'hàm': 'Định nghĩa hàm\n```datable\nhàm tên_hàm(tham_số1, tham_số2):\n    # thân hàm\n    trả_về kết_quả\n```',
      'trả_về': 'Trả về giá trị từ hàm',
      'bỏ_qua': 'Bỏ qua vòng lặp hiện tại',
      'chọn_bảng': 'Chọn bảng để làm việc\n```datable\nchọn_bảng "tên_bảng"\n```'
    };

    // Documentation cho hàm builtin
    const functionDocs = {
      'ô': 'Truy cập giá trị ô\n```datable\ngiá_trị = ô(hàng, cột)\n```',
      'gán_ô': 'Gán giá trị cho ô\n```datable\ngán_ô(hàng, cột, giá_trị)\n# hoặc\nô(hàng, cột) = giá_trị\n```',
      'vùng': 'Đọc vùng dữ liệu\n```datable\ndữ_liệu = vùng("A1:C3")\n```',
      'đặt_vùng': 'Ghi vùng dữ liệu\n```datable\nđặt_vùng("A1:C3", dữ_liệu)\n```',
      'ánh_xạ': 'Ánh xạ mảng\n```datable\nkết_quả = ánh_xạ(mảng, "x * 2")\n```',
      'lọc': 'Lọc mảng\n```datable\nkết_quả = lọc(mảng, "x > 5")\n```',
      'gộp': 'Gộp mảng\n```datable\ntổng = gộp(mảng, "total + current", 0)\n```',
      'chứa': 'Kiểm tra phần tử trong mảng\n```datable\ncó_chứa = chứa(mảng, phần_tử)\n```',
      'có_khóa': 'Kiểm tra key trong object\n```datable\ncó_tồn_tại = có_khóa(object, "tên")\n```',
      'có_giá_trị': 'Kiểm tra value trong object\n```datable\ncó_tồn_tại = có_giá_trị(object, "giá_trị")\n```',
      'json_chuỗi': 'Chuyển object thành JSON string\n```datable\nchuỗi = json_chuỗi(object)\n```',
      'json_phân_tích': 'Phân tích JSON string thành object\n```datable\nobject = json_phân_tích(chuỗi_json)\n```'
    };

    // Documentation cho toán tử
    const operatorDocs = {
      'và': 'Toán tử logic AND\n```datable\nnếu điều_kiện1 và điều_kiện2:\n    # cả hai điều kiện đều đúng\n```',
      'hoặc': 'Toán tử logic OR\n```datable\nnếu điều_kiện1 hoặc điều_kiện2:\n    # ít nhất một điều kiện đúng\n```',
      'không': 'Toán tử logic NOT\n```datable\nnếu không điều_kiện:\n    # điều kiện sai\n```'
    };

    let documentation = null;

    if (keywordDocs[wordText]) {
      documentation = keywordDocs[wordText];
    } else if (functionDocs[wordText]) {
      documentation = functionDocs[wordText];
    } else if (operatorDocs[wordText]) {
      documentation = operatorDocs[wordText];
    }

    if (documentation) {
      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        ),
        contents: [
          { value: `**${wordText}**` },
          { value: documentation }
        ]
      };
    }

    return null;
  }
});

// Định nghĩa cấu hình cho editor
const datableEditorConfig = {
  wordBasedSuggestions: true,
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  tabCompletion: 'on',
  wordSeparators: '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?',
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  autoIndent: 'full',
  formatOnType: true,
  formatOnPaste: true,
  folding: true,
  lineNumbers: 'on',
  renderLineHighlight: 'all',
  selectOnLineNumbers: true,
  roundedSelection: false,
  readOnly: false,
  cursorStyle: 'line',
  automaticLayout: true
};

// Hàm khởi tạo editor DaTable
function createDaTableEditor(container, options = {}) {
  const defaultOptions = {
    value: options.value || '',
    language: 'datable',
    theme: options.theme || 'vs-dark',
    ...datableEditorConfig,
    ...options
  };

  return monaco.editor.create(container, defaultOptions);
}

// Hàm thêm snippet
function registerDaTableSnippets() {
  const snippets = [
    {
      label: 'if',
      documentation: 'Câu lệnh điều kiện if',
      insertText: 'nếu ${1:điều_kiện}:\n\t${2:# khối lệnh}'
    },
    {
      label: 'if-else',
      documentation: 'Câu lệnh điều kiện if-else',
      insertText: 'nếu ${1:điều_kiện}:\n\t${2:# khối if}\nkhác:\n\t${3:# khối else}'
    },
    {
      label: 'if-elseif-else',
      documentation: 'Câu lệnh điều kiện if-elseif-else',
      insertText: 'nếu ${1:điều_kiện1}:\n\t${2:# khối 1}\nkhác_nếu ${3:điều_kiện2}:\n\t${4:# khối 2}\nkhác:\n\t${5:# khối else}'
    },
    {
      label: 'for',
      documentation: 'Vòng lặp for',
      insertText: 'lặp ${1:i} từ ${2:1} đến ${3:10}:\n\t${4:# khối lệnh}'
    },
    {
      label: 'function',
      documentation: 'Định nghĩa hàm',
      insertText: 'hàm ${1:tên_hàm}(${2:tham_số}):\n\t${3:# thân hàm}\n\ttrả_về ${4:giá_trị}'
    },
    {
      label: 'table',
      documentation: 'Chọn bảng',
      insertText: 'chọn_bảng "${1:tên_bảng}"'
    },
    {
      label: 'cell',
      documentation: 'Truy cập ô',
      insertText: 'ô(${1:hàng}, ${2:cột})'
    },
    {
      label: 'range',
      documentation: 'Đọc vùng',
      insertText: 'vùng("${1:A1:C3}")'
    },
    {
      label: 'set-range',
      documentation: 'Ghi vùng',
      insertText: 'đặt_vùng("${1:A1:C3}", ${2:giá_trị})'
    },
    {
      label: 'array-map',
      documentation: 'Ánh xạ mảng',
      insertText: 'ánh_xạ(${1:mảng}, "${2:x * 2}")'
    },
    {
      label: 'array-filter',
      documentation: 'Lọc mảng',
      insertText: 'lọc(${1:mảng}, "${2:x > 5}")'
    },
    {
      label: 'json-stringify',
      documentation: 'Chuyển object thành JSON',
      insertText: 'json_chuỗi(${1:object})'
    },
    {
      label: 'json-parse',
      documentation: 'Phân tích JSON',
      insertText: 'json_phân_tích(${1:chuỗi_json})'
    }
  ];

  // Đăng ký snippets với completion provider
  monaco.languages.registerCompletionItemProvider('datable', {
    provideCompletionItems: function(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      return {
        suggestions: snippets.map(snippet => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          documentation: snippet.documentation,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: range
        }))
      };
    }
  });
}

// Khởi tạo tất cả tính năng
function initDaTableLanguage() {
  console.log('Đã khởi tạo ngôn ngữ DaTable cho Monaco Editor');
  registerDaTableSnippets();
}

// Xuất các hàm để sử dụng
window.DaTableLanguage = {
  init: initDaTableLanguage,
  createEditor: createDaTableEditor
};

// Tự động khởi tạo khi load
if (window.monaco) {
  initDaTableLanguage();
}
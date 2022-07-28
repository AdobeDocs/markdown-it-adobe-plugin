/* eslint-disable no-func-assign */
'use strict';

function _extends() {
  _extends =
    Object.assign ||
    function (target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];

        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }

      return target;
    };

  return _extends.apply(this, arguments);
}

const path = require('path');
const fs = require('fs');

const INCLUDE_RE = /\{\{\$include\s+(.+)\}\}/i;
const SNIPPET_RE = /\{\{(.+)\}\}/i;
const SNIPPET_HEADER_RE = /##\s+(.*)\{#(.*)\}/i;
const SNIPPET_FILE = 'help/_includes/snippets.md';
const INCLUDE_PATH = 'help/_includes';
const COLLAPSIBLE_RE = /\+\+\+\s+(.*)$/i;

module.exports = function exl_block_plugin(md, options) {
  const defaultOptions = {
    root: '.',
    getRootDir: (pluginOptions) => pluginOptions.root,
    includeRe: INCLUDE_RE,
    snippetRe: SNIPPET_RE,
    snippetHeaderRe: SNIPPET_HEADER_RE,
    includePath: INCLUDE_PATH,
    collapsibleRe: COLLAPSIBLE_RE,
    snippetFile: SNIPPET_FILE,
    throwError: false,
    bracesAreOptional: false,
    notFoundMessage: "File '{{FILE}}' not found.",
    circularMessage: "Circular reference between '{{FILE}}' and '{{PARENT}}'.",
  };

  if (typeof options === 'string') {
    options = _extends({}, defaultOptions, {
      root: options,
    });
  } else {
    options = _extends({}, defaultOptions, options);
  }

  let snippets; // Store snippets in memory to avoid reading them multiple times

  /**
   * An enumeration of token types.
   *
   * @type {Object<string,string>}
   */
  let TokenType = {
    BLOCKQUOTE_OPEN: 'blockquote_open',
    BLOCKQUOTE_CLOSE: 'blockquote_close',
    PARAGRAPH_OPEN: 'paragraph_open',
    PARAGRAPH_CLOSE: 'paragraph_close',
    INLINE: 'inline',
    HEADING_OPEN: 'heading_open',
    TABLE_OPEN: 'table_open',
    TABLE_CLOSE: 'table_close',
  };

  /**
   * DNL (Do Not Localize) transformation rule. Simply strips the [!DNL <text>] markdown
   * and leaves the <text> part.
   * @param {} state
   */

  function transformDNL(state) {
    let inlineTokens = state.tokens.filter(
      (tok) => tok.type === TokenType.INLINE
    );
    const dnlRegex = /\[\!DNL\s+([^\]]+)\]/;
    for (var i = 0, l = inlineTokens.length; i < l; i++) {
      // Check for all instances of dnlRegex and replace with the text
      // between the brackets.
      let text = inlineTokens[i].content;
      let match = dnlRegex.exec(text);
      while (match) {
        text = text.replace(match[0], match[1]);
        match = dnlRegex.exec(text);
      }
    }
  }

  /**
   * DNL (Do Not Localize) transformation rule. Simply strips the [!DNL <text>] markdown
   * and leaves the <text> part.
   * @param {} state
   */

  function transformUICONTROL(state) {
    let inlineTokens = state.tokens.filter(
      (tok) => tok.type === TokenType.INLINE
    );
    const dnlRegex = /\[\!UICONTROL\s+([^\]]+)\]/;
    for (var i = 0, l = inlineTokens.length; i < l; i++) {
      // Check for all instances of dnlRegex and replace with the text
      // between the brackets.
      let text = inlineTokens[i].content;
      let match = dnlRegex.exec(text);
      while (match) {
        text = text.replace(match[0], match[1]);
        match = dnlRegex.exec(text);
      }
    }
  }

  function transformLinkTargets(state) {
    let linkTokens = state.tokens;
    const targetMatch = /\{\w*target\w*=\w*([^}]*)\}/;

    for (var i = 0, l = linkTokens.length; i < l; i++) {
      if (linkTokens[i].type === TokenType.INLINE) {
        const linkLine = linkTokens[i].content;
        if (linkLine) {
          const ids = linkLine.match(targetMatch);
          if (ids && ids[1]) {
            linkTokens[i].attrSet('target', ids[1]);
            linkTokens[i].content = linkLine.replace(ids[0], '');
          }
        }
      }
    }
  }

  function transformHeaderAnchors(state) {
    let headingTokens = state.tokens;
    const anchorMatch = /{#([^}]+)}/;
    for (var i = 0, l = headingTokens.length; i < l; i++) {
      if (headingTokens[i].type === TokenType.HEADING_OPEN) {
        const headline = headingTokens[i + 1].content;
        if (headline) {
          const ids = headline.match(anchorMatch);
          if (ids && ids[1]) {
            headingTokens[i].attrSet('id', ids[1]);
            headingTokens[i + 1].content = headline.substr(0, ids.index);
          }
        }
      }
    }
  }

  /**
   * Alert Transformation Rule
   *
   * Alert Markup
   * .
   * >[!NOTE]
   * >
   * >This is note text.
   * .
   * <div class="alert note" data-label="NOTE">
   * <div class="p"></div>
   * <div class="p">This is note text.</div>
   * </div>
   * .
   *
   *
   * @return {void}
   */

  function transformAlerts(state) {
    let tokens = state.tokens;
    let startBlock = -1;
    let level = 0;

    for (var i = 0, l = tokens.length; i < l; i++) {
      // Is this the start of a blockquote?  If so, set the starting index and increment
      // the level.
      if (tokens[i].type === TokenType.BLOCKQUOTE_OPEN) {
        level += 1;
        startBlock = i;
      }

      // Are we inside a block quote? If not, then just go to the next token.
      if (level === 0) {
        // We're not in a block quote context. Skip tokens until we are.
        continue;
      }

      // Are we at the end of the block?  If so, then decrement the level and pair the
      // token with the start token.
      if (tokens[i].type === TokenType.BLOCKQUOTE_CLOSE) {
        level -= 1;
        // tokens[i].type = tokens[startBlock].type;
        tokens[i].tag = tokens[startBlock].tag; // If this is an ExlTag;
        continue;
      }
      // We are inside an ExL block because level > 0.
      // Adobe ExL marks up paragraphs as <div class='p'></div> instead of using <p></p> tags
      if (tokens[i].type === TokenType.PARAGRAPH_OPEN) {
        tokens[i].tag = 'div';
        tokens[i].attrSet('class', 'p');
        continue;
      } else if (tokens[i].type === TokenType.PARAGRAPH_CLOSE) {
        tokens[i].tag = 'div';
        continue;
      }
      // The next token after the paragraph open will be the label of the note type that could
      // be one of [!NOTE], [!CAUTION], [!IMPORTANT], [!TIP], [!WARNING].  If it's not, then this is an
      // ordinary block, so stop processing.
      if (tokens[i].type === TokenType.INLINE) {
        let labelMatches = tokens[i].content.match(
          // eslint-disable-next-line max-len
          /^\[\!(NOTE|CAUTION|IMPORTANT|TIP|WARNING|ADMINISTRATION|AVAILABILITY|PREREQUISITES|ERROR|INFO|SUCCESS|MORELIKETHIS)\](\n\s*)*(.*)/
        );
        if (labelMatches) {
          tokens[i].content = labelMatches[3]; // Clear the [!NOTE] label text, retaining the message.
          let labelText =
            labelMatches[1] === 'MORELIKETHIS'
              ? 'Related Articles'
              : labelMatches[1] || 'alert';
          tokens[startBlock].tag = 'div';
          tokens[startBlock].attrSet(
            'class',
            `extension ${labelMatches[1].toLowerCase()}`
          );
          tokens[startBlock].attrSet('data-label', labelText);
        } else {
          let videoMatches = tokens[i].content.match(/^\[\!VIDEO\]\s*\((.*)\)/);

          if (videoMatches) {
            let url = videoMatches[1];
            tokens[startBlock].tag = 'div';
            tokens[startBlock].attrSet('class', 'extension video');
            tokens[i - 1].tag = 'video';
            tokens[i - 1].attrSet('allowfullscreen', true);
            tokens[i - 1].attrSet('controls', true);
            tokens[i - 1].attrSet('height', 250);
            tokens[i - 1].attrSet('poster', '/assets/img/video_slug.png');
            tokens[i - 1].attrSet('crossorigin', 'anonymous');
            tokens[i - 1].attrSet('src', url);
            tokens[i].content = '';
            tokens[i + 1].tag = 'video';
            // Increment the counter to skip the closing tag we just made.
            i += 1;
          }
        }
      }
    }
  }

  /**
   * Ignore the {style="table-layout:fixed"} attribute after a table.
   */

  function ignoreTableStyles(state) {
    let inlineTokens = state.tokens.filter(
      (tok) => tok.type === TokenType.INLINE
    );
    const styleRegEx = /\{style[^\}]*\}/;
    for (var i = 0, l = inlineTokens.length; i < l; i++) {
      // Remove the matching style directive from the token list.
      let text = inlineTokens[i].content;
      let match = styleRegEx.exec(text);
      if (match) {
        inlineTokens[i].content = text.replace(match[0], '');
      }
    }
  }

  /**
   * Find all {{$include <path>}} tags and replace them with the contents of the named file.
   * @param {src} String  source text to be processed.
   * @param {rootdir} String root directory to use when resolving the include path.
   * @param {parentFilePath} String path of the file that contains the include directive (for recursion)
   * @param {filesProcessed} [String] list of files that have already been processed (for recursion)
   * @return {void}
   */
  function replaceIncludeByContent(
    src,
    rootdir,
    parentFilePath,
    filesProcessed
  ) {
    filesProcessed = filesProcessed ? filesProcessed.slice() : []; // making a copy

    let cap, filePath, mdSrc, errorMessage; // store parent file path to check circular references

    if (parentFilePath) {
      filesProcessed.push(parentFilePath);
    }

    while ((cap = options.includeRe.exec(src))) {
      let includePath = cap[1].trim();
      filePath = path.join(rootdir, includePath); // check if child file exists or if there is a circular reference
      if (!fs.existsSync(filePath)) {
        // child file does not exist
        errorMessage = options.notFoundMessage.replace('{{FILE}}', filePath);
      } else if (filesProcessed.indexOf(filePath) !== -1) {
        // reference would be circular
        errorMessage = options.circularMessage
          .replace('{{FILE}}', filePath)
          .replace('{{PARENT}}', parentFilePath);
      }

      if (errorMessage) {
        if (options.throwError) {
          throw new Error(errorMessage);
        }

        mdSrc = `\n\n# INCLUDE ERROR: ${errorMessage}\n\n`;
      } else {
        // get content of child file
        mdSrc = fs.readFileSync(filePath, 'utf8'); // check if child file also has includes
        mdSrc = replaceIncludeByContent(
          mdSrc,
          path.dirname(filePath),
          filePath,
          filesProcessed
        );
        // remove one trailing newline, if it exists: that way, the included content does NOT
        // automatically terminate the paragraph it is in due to the writer of the included
        // part having terminated the content with a newline.
        // However, when that snippet writer terminated with TWO (or more) newlines, these, minus one,
        // will be merged with the newline after the #include statement, resulting in a 2-NL paragraph
        // termination.
        const len = mdSrc.length;
        if (mdSrc[len - 1] === '\n') {
          mdSrc = mdSrc.substring(0, len - 1);
        }
      } // replace include by file content

      src =
        src.slice(0, cap.index) +
        mdSrc +
        src.slice(cap.index + cap[0].length, src.length);
    }

    return src;
  }

  function loadSnippetsFile() {
    // read the snippet file and parse the content between matching snippedHeaderRe regular expression, indexed by the
    // snippet name from the 2nd group of the regular expression.
    const localSnippets = {};
    const snippetFile = path.join(
      options.getRootDir(options),
      options.snippetFile
    );
    if (fs.existsSync(snippetFile)) {
      const snippetContent = fs.readFileSync(snippetFile, 'utf8');
      const snippetLines = snippetContent.split('\n');
      let snippet = {};
      let snippetName = '';
      snippetLines.forEach((line) => {
        const match = options.snippetHeaderRe.exec(line);
        if (match) {
          const text = match[1];
          snippetName = match[2];
          snippet = {
            name: snippetName,
            text: text,
          };
          localSnippets[snippetName] = snippet;
        } else if (snippetName) {
          if (localSnippets[snippetName].content) {
            localSnippets[snippetName].content += '\n' + line;
          } else {
            localSnippets[snippetName].content = line;
          }
        } else {
          console.warn('Ignoring line:', line);
        }
      });
      console.log('Snippets:', localSnippets);
    }
    return localSnippets;
  }

  function replaceSnippetByContent(src, parentFilePath, filesProcessed) {
    // Make sure we've loaded the snippets before we try to replace them.
    if (!snippets) {
      snippets = loadSnippetsFile();
    }
    filesProcessed = filesProcessed ? filesProcessed.slice() : []; // making a copy

    let cap; // store parent file path to check circular references

    if (parentFilePath) {
      filesProcessed.push(parentFilePath);
    }

    while ((cap = options.snippetRe.exec(src))) {
      let snippetName = cap[1].trim();
      let mdSrc = snippets[snippetName]
        ? snippets[snippetName].content
        : `*** ERROR: Snippet ${snippetName} not found. ***`;
      src =
        src.slice(0, cap.index) +
        mdSrc +
        src.slice(cap.index + cap[0].length, src.length);
    }
    return src;
  }

  function includeFileParts(state, startLine, endLine /*, silent*/) {
    state.src = replaceIncludeByContent(
      state.src,
      options.getRootDir(options, state, startLine, endLine)
    );
    state.src = replaceSnippetByContent(
      state.src,
      options.getRootDir(options, state, startLine, endLine)
    );
  }

  /**
   * Look for lines that begin with "+++".  These lines delimit a collapsible section of the document. Replace the
   * "+++" with a <details> opening and a </details> closing tag surrounding the collapible section.  Place the text
   * after the "+++" in a <summary> tag.
   * @param {*} state
   */
  function transformCollapsible(state) {
    let tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i];
      if (token.type === 'inline') {
        let text = token.content;
        // Find the opening +++ line.
        if (text.startsWith('+++')) {
          let collapsibleText = text.substring(3).trim();
          // insert the opening <details> tag
          token.content = '<details>';
          // insert the summary tag
          tokens.splice(i + 1, 0, {
            type: 'html_block',
            content: `<summary>${collapsibleText}</summary>`,
          });
          // Find the closing +++ line.
          i += 2;
          while (i < tokens.length) {
            let nextToken = tokens[i];
            if (nextToken.type === 'inline') {
              text = nextToken.content;
              if (text.startsWith('+++')) {
                // remove the +++ line
                tokens.splice(i, 1);
                // insert the closing </details> tag
                tokens.splice(i, 0, {
                  type: 'html_block',
                  content: '</details>',
                });
                break;
              }
            }
            i++;
          }
        }
      }
    }
  }

  // Install the rule processors
  md.core.ruler.before('normalize', 'include', includeFileParts);
  md.core.ruler.after('block', 'dnl', transformDNL);
  md.core.ruler.after('block', 'uicontrol', transformUICONTROL);
  md.core.ruler.after('block', 'alert', transformAlerts);
  md.core.ruler.after('block', 'heading-anchors', transformHeaderAnchors);
  md.core.ruler.after('block', 'link-target', transformLinkTargets);
  md.core.ruler.after('block', 'table-styles', ignoreTableStyles);
  md.core.ruler.after('block', 'collapsible', transformCollapsible);
};

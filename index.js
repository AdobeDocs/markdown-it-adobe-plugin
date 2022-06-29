'use strict';

module.exports = function exl_block_plugin(md /*, name, options*/) {
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

  // Install the rule processors
  md.core.ruler.after('block', 'dnl', transformDNL);
  md.core.ruler.after('block', 'uicontrol', transformUICONTROL);
  md.core.ruler.after('block', 'alert', transformAlerts);
  md.core.ruler.after('block', 'heading-anchors', transformHeaderAnchors);
  md.core.ruler.after('block', 'link-target', transformLinkTargets);
  md.core.ruler.after('block', 'table-styles', ignoreTableStyles);
};

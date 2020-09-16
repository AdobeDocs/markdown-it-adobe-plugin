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
  };

  /**
   * DNL (Do Not Localize) transformation rule. Simply strips the [!DNL <text>] markdown
   * and leaves the <text> part.
   * @param {} state
   */

  function transformDNL(state) {
    let tokens = state.tokens;

    for (var i = 0, l = tokens.length; i < l; i++) {
      if (tokens[i].type !== TokenType.INLINE) {
        continue;
      } else {
        const dnlRegex = /\[\!DNL\s+([^\]]+)\]/;
        let dnlMatches = tokens[i].content.match(dnlRegex);
        if (dnlMatches) {
          tokens[i].content = tokens[i].content.replace(
            dnlRegex,
            dnlMatches[1]
          );
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
          /^\[\!(NOTE|CAUTION|IMPORTANT|TIP|WARNING|MORELIKETHIS)\](\n\s*)*(.*)/
        );
        if (labelMatches) {
          tokens[i].content = labelMatches[3]; // Clear the [!NOTE] label text, retaining the message.
          let labelText = labelMatches[1];
          tokens[startBlock].tag = 'div';
          tokens[startBlock].attrSet(
            'class',
            `extension ${labelText.toLowerCase()}`
          );
          tokens[startBlock].attrSet('data-label', labelText);
        } else {
          let videoMatches = tokens[i].content.match(/^\[\!VIDEO\]\s*\((.*)\)/);

          if (videoMatches) {
            let url = videoMatches[1];
            tokens[startBlock].tag = 'div';
            tokens[startBlock].attrSet('class', 'extension video');
            tokens[i - 1].tag = 'iframe';
            tokens[i - 1].attrSet('allowfullscreen', true);
            tokens[i - 1].attrSet('embedded-video', true);
            tokens[i - 1].attrSet(
              'style',
              'position: absolute; top: 0; left: 0; width: 100%;'
            );
            tokens[i - 1].attrSet('src', url);
            tokens[i].content = '';
            tokens[i + 1].tag = 'iframe';
            // Increment the counter to skip the closing tag we just made.
            i += 1;
          }
        }
      }
    }
  }
  // Install the rule processors
  md.core.ruler.after('block', 'dnl', transformDNL);
  md.core.ruler.after('block', 'alert', transformAlerts);
};

/**
         * WebSocket handling
         */

        // Connect the server with a WebSocket connection
        const userId = "demo-user";
        const sessionId = "demo-session-" + Math.random().toString(36).substring(7);
        let websocket = null;
        let videoWebsocket = null;
        let is_audio = false;
        let lastAudioTime = Date.now();

        // Monitor audio rate (original)
        setInterval(() => {
          const elapsed = Date.now() - lastAudioTime;
          if (is_audio && elapsed > 1000) {
            console.warn(`No audio sent for ${elapsed}ms - possible audio worklet issue`);
          }
        }, 2000);

        // NEW: Audio health recovery check (every 5 seconds)
        

        // Get checkbox elements for RunConfig options
        const enableProactivityCheckbox = document.getElementById("enableProactivity");
        const enableAffectiveDialogCheckbox = document.getElementById("enableAffectiveDialog");

        // Reconnect WebSocket when RunConfig options change
        function handleRunConfigChange() {
          if (websocket && websocket.readyState === WebSocket.OPEN) {
            addSystemMessage("Reconnecting with updated settings...");
            addConsoleEntry(
              'outgoing',
              'Reconnecting due to settings change',
              {
                proactivity: enableProactivityCheckbox.checked,
                affective_dialog: enableAffectiveDialogCheckbox.checked
              },
              '🔄',
              'system'
            );

            // Set handlers BEFORE closing
            websocket.onerror = (error) => {
              console.error('WebSocket error:', error);
              addConsoleEntry('error', 'WebSocket error occurred', error, '⚠️', 'system');
            };

            websocket.onclose = (event) => {
              console.log('WebSocket closed:', event.code, event.reason);
              addConsoleEntry(
                'error',
                `Connection closed: ${event.code} - ${event.reason}`,
                event,
                '🔌',
                'system'
              );

              // Reconnect after short delay
              setTimeout(() => {
                connectWebsocket();
              }, 500);
            };

            websocket.close();
          }
        }

        // Add change listeners to RunConfig checkboxes
        enableProactivityCheckbox.addEventListener("change", handleRunConfigChange);
        enableAffectiveDialogCheckbox.addEventListener("change", handleRunConfigChange);

        // Build WebSocket URL with RunConfig options as query parameters
        function getWebSocketUrl() {
          // Use wss:// for HTTPS pages, ws:// for HTTP (localhost development)
          const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const baseUrl = wsProtocol + "//" + window.location.host + "/ws/" + userId + "/" + sessionId;
          const params = new URLSearchParams();

          // Add proactivity option if checked
          if (enableProactivityCheckbox && enableProactivityCheckbox.checked) {
            params.append("proactivity", "true");
          }

          // Add affective dialog option if checked
          if (enableAffectiveDialogCheckbox && enableAffectiveDialogCheckbox.checked) {
            params.append("affective_dialog", "true");
          }

          const queryString = params.toString();
          return queryString ? baseUrl + "?" + queryString : baseUrl;
        }

        // Get DOM elements (all original)
        const messageForm = document.getElementById("messageForm");
        const messageInput = document.getElementById("message");
        const messagesDiv = document.getElementById("messages");
        const statusIndicator = document.getElementById("statusIndicator");
        const statusText = document.getElementById("statusText");
        const consoleContent = document.getElementById("consoleContent");
        const clearConsoleBtn = document.getElementById("clearConsole");
        const showAudioEventsCheckbox = document.getElementById("showAudioEvents");
        let currentMessageId = null;
        let currentBubbleElement = null;
        let currentInputTranscriptionId = null;
        let currentInputTranscriptionElement = null;
        let currentOutputTranscriptionId = null;
        let currentOutputTranscriptionElement = null;
        let inputTranscriptionFinished = false; // Track if input transcription is complete for this turn
        let isAgentSuppressed = false; // Suppress buffered agent output after interrupted event
        let lastTurnCompleteTime = 0;  
        // Helper function to clean spaces between CJK characters (original)
        function cleanCJKSpaces(text) {
          // CJK Unicode ranges: Hiragana, Katakana, Kanji, CJK Unified Ideographs, Fullwidth forms
          const cjkPattern = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uff00-\uffef]/;

          // Remove spaces between two CJK characters
          return text.replace(/(\S)\s+(?=\S)/g, (match, char1) => {
            // Get the character after the space(s)
            const nextCharMatch = text.match(new RegExp(char1 + '\\s+(.)', 'g'));
            if (nextCharMatch && nextCharMatch.length > 0) {
              const char2 = nextCharMatch[0].slice(-1);
              // If both characters are CJK, remove the space
              if (cjkPattern.test(char1) && cjkPattern.test(char2)) {
                return char1;
              }
            }
            return match;
          });
        }

        // Console logging functionality (original)
        function formatTimestamp() {
          const now = new Date();
          return now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
        }

        function addConsoleEntry(type, content, data = null, emoji = null, author = null, isAudio = false) {
          // Skip audio events if checkbox is unchecked
          if (isAudio && !showAudioEventsCheckbox.checked) {
            return;
          }

          const entry = document.createElement("div");
          entry.className = `console-entry ${type}`;

          const header = document.createElement("div");
          header.className = "console-entry-header";

          const leftSection = document.createElement("div");
          leftSection.className = "console-entry-left";

          // Add emoji icon if provided
          if (emoji) {
            const emojiIcon = document.createElement("span");
            emojiIcon.className = "console-entry-emoji";
            emojiIcon.textContent = emoji;
            leftSection.appendChild(emojiIcon);
          }

          // Add expand/collapse icon
          const expandIcon = document.createElement("span");
          expandIcon.className = "console-expand-icon";
          expandIcon.textContent = data ? "▶" : "";

          const typeLabel = document.createElement("span");
          typeLabel.className = "console-entry-type";
          typeLabel.textContent = type === 'outgoing' ? '↑ Upstream' : type === 'incoming' ? '↓ Downstream' : '⚠ Error';

          leftSection.appendChild(expandIcon);
          leftSection.appendChild(typeLabel);

          // Add author badge if provided
          if (author) {
            const authorBadge = document.createElement("span");
            authorBadge.className = "console-entry-author";
            authorBadge.textContent = author;
            authorBadge.setAttribute('data-author', author);
            leftSection.appendChild(authorBadge);
          }

          const timestamp = document.createElement("span");
          timestamp.className = "console-entry-timestamp";
          timestamp.textContent = formatTimestamp();

          header.appendChild(leftSection);
          header.appendChild(timestamp);

          const contentDiv = document.createElement("div");
          contentDiv.className = "console-entry-content";
          contentDiv.textContent = content;

          entry.appendChild(header);
          entry.appendChild(contentDiv);

          // JSON details (hidden by default)
          let jsonDiv = null;
          if (data) {
            jsonDiv = document.createElement("div");
            jsonDiv.className = "console-entry-json collapsed";
            const pre = document.createElement("pre");
            pre.textContent = JSON.stringify(data, null, 2);
            jsonDiv.appendChild(pre);
            entry.appendChild(jsonDiv);

            // Make entry clickable if it has data
            entry.classList.add("expandable");

            // Toggle expand/collapse on click
            entry.addEventListener("click", () => {
              const isExpanded = !jsonDiv.classList.contains("collapsed");

              if (isExpanded) {
                // Collapse
                jsonDiv.classList.add("collapsed");
                expandIcon.textContent = "▶";
                entry.classList.remove("expanded");
              } else {
                // Expand
                jsonDiv.classList.remove("collapsed");
                expandIcon.textContent = "▼";
                entry.classList.add("expanded");
              }
            });
          }

          consoleContent.appendChild(entry);
          consoleContent.scrollTop = consoleContent.scrollHeight;
        }

        function clearConsole() {
          consoleContent.innerHTML = '';
        }

        // Clear console button handler
        clearConsoleBtn.addEventListener('click', clearConsole);

        // Update connection status UI (original)
        function updateConnectionStatus(connected) {
          if (connected) {
            statusIndicator.classList.remove("disconnected");
            statusText.textContent = "Connected";
          } else {
            statusIndicator.classList.add("disconnected");
            statusText.textContent = "Disconnected";
          }
        }

        // Create a message bubble element (original)
        function createMessageBubble(text, isUser, isPartial = false) {
          const messageDiv = document.createElement("div");
          messageDiv.className = `message ${isUser ? "user" : "agent"}`;

          const bubbleDiv = document.createElement("div");
          bubbleDiv.className = "bubble";

          const textP = document.createElement("p");
          textP.className = "bubble-text";
          textP.textContent = text;

          // Add typing indicator for partial messages
          if (isPartial && !isUser) {
            const typingSpan = document.createElement("span");
            typingSpan.className = "typing-indicator";
            textP.appendChild(typingSpan);
          }

          bubbleDiv.appendChild(textP);
          messageDiv.appendChild(bubbleDiv);

          return messageDiv;
        }

        // Create an image message bubble element (original)
        function createImageBubble(imageDataUrl, isUser) {
          const messageDiv = document.createElement("div");
          messageDiv.className = `message ${isUser ? "user" : "agent"}`;

          const bubbleDiv = document.createElement("div");
          bubbleDiv.className = "bubble image-bubble";

          const img = document.createElement("img");
          img.src = imageDataUrl;
          img.className = "bubble-image";
          img.alt = "Captured image";

          bubbleDiv.appendChild(img);
          messageDiv.appendChild(bubbleDiv);

          return messageDiv;
        }

        // Update existing message bubble text (original)
        function updateMessageBubble(element, text, isPartial = false) {
          const textElement = element.querySelector(".bubble-text");

          // Remove existing typing indicator
          const existingIndicator = textElement.querySelector(".typing-indicator");
          if (existingIndicator) {
            existingIndicator.remove();
          }

          textElement.textContent = text;

          // Add typing indicator for partial messages
          if (isPartial) {
            const typingSpan = document.createElement("span");
            typingSpan.className = "typing-indicator";
            textElement.appendChild(typingSpan);
          }
        }

        // Add a system message (original)
        function addSystemMessage(text) {
          const messageDiv = document.createElement("div");
          messageDiv.className = "system-message";
          messageDiv.textContent = text;
          messagesDiv.appendChild(messageDiv);
          scrollToBottom();
        }

        // Scroll to bottom of messages (original)
        function scrollToBottom() {
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        // Sanitize event data for console display (original)
        function sanitizeEventForDisplay(event) {
          // Deep clone the event object
          const sanitized = JSON.parse(JSON.stringify(event));

          // Check for audio data in content.parts
          if (sanitized.content && sanitized.content.parts) {
            sanitized.content.parts = sanitized.content.parts.map(part => {
              if (part.inlineData && part.inlineData.data) {
                // Calculate byte size (base64 string length / 4 * 3, roughly)
                const byteSize = Math.floor(part.inlineData.data.length * 0.75);
                return {
                  ...part,
                  inlineData: {
                    ...part.inlineData,
                    data: `(${byteSize.toLocaleString()} bytes)`
                  }
                };
              }
              return part;
            });
          }

          return sanitized;
        }

        // WebSocket handlers (original until onmessage)
        function connectWebsocket() {
          // Connect websocket
          const ws_url = getWebSocketUrl();
          websocket = new WebSocket(ws_url);

          // Handle connection open
          websocket.onopen = function () {
            console.log("WebSocket connection opened.");
            updateConnectionStatus(true);
            addSystemMessage("Connected to ADK streaming server");

            // Log to console
            addConsoleEntry('incoming', 'WebSocket Connected', {
              userId: userId,
              sessionId: sessionId,
              url: ws_url
            }, '🔌', 'system');

            // Enable the Send button
            document.getElementById("sendButton").disabled = false;
            addSubmitHandler();
          };

          // Handle incoming messages
          websocket.onmessage = function (event) {
            // Parse the incoming ADK Event
            const adkEvent = JSON.parse(event.data);
            console.log("[AGENT TO CLIENT] ", adkEvent);

            // Log to console panel
            let eventSummary = 'Event';
            let eventEmoji = '📨'; // Default emoji
            const author = adkEvent.author || 'system';

            if (adkEvent.turnComplete) {
              eventSummary = 'Turn Complete';
              eventEmoji = '✅';
            } else if (adkEvent.interrupted) {
              eventSummary = 'Interrupted';
              eventEmoji = '⏸️';
            } else if (adkEvent.inputTranscription) {
              // Show transcription text in summary
              const transcriptionText = adkEvent.inputTranscription.text || '';
              const truncated = transcriptionText.length > 60
                ? transcriptionText.substring(0, 60) + '...'
                : transcriptionText;
              eventSummary = `Input Transcription: "${truncated}"`;
              eventEmoji = '📝';
            } else if (adkEvent.outputTranscription) {
              // Show transcription text in summary
              const transcriptionText = adkEvent.outputTranscription.text || '';
              const truncated = transcriptionText.length > 60
                ? transcriptionText.substring(0, 60) + '...'
                : transcriptionText;
              eventSummary = `Output Transcription: "${truncated}"`;
              eventEmoji = '📝';
            } else if (adkEvent.usageMetadata) {
              // Show token usage information
              const usage = adkEvent.usageMetadata;
              const promptTokens = usage.promptTokenCount || 0;
              const responseTokens = usage.candidatesTokenCount || 0;
              const totalTokens = usage.totalTokenCount || 0;
              eventSummary = `Token Usage: ${totalTokens.toLocaleString()} total (${promptTokens.toLocaleString()} prompt + ${responseTokens.toLocaleString()} response)`;
              eventEmoji = '📊';
            } else if (adkEvent.content && adkEvent.content.parts) {
              const hasText = adkEvent.content.parts.some(p => p.text);
              const hasAudio = adkEvent.content.parts.some(p => p.inlineData);
              const hasExecutableCode = adkEvent.content.parts.some(p => p.executableCode);
              const hasCodeExecutionResult = adkEvent.content.parts.some(p => p.codeExecutionResult);

              if (hasExecutableCode) {
                // Show executable code
                const codePart = adkEvent.content.parts.find(p => p.executableCode);
                if (codePart && codePart.executableCode) {
                  const code = codePart.executableCode.code || '';
                  const language = codePart.executableCode.language || 'unknown';
                  const truncated = code.length > 60
                    ? code.substring(0, 60).replace(/\n/g, ' ') + '...'
                    : code.replace(/\n/g, ' ');
                  eventSummary = `Executable Code (${language}): ${truncated}`;
                  eventEmoji = '💻';
                }
              }

              if (hasCodeExecutionResult) {
                // Show code execution result
                const resultPart = adkEvent.content.parts.find(p => p.codeExecutionResult);
                if (resultPart && resultPart.codeExecutionResult) {
                  const outcome = resultPart.codeExecutionResult.outcome || 'UNKNOWN';
                  const output = resultPart.codeExecutionResult.output || '';
                  const truncatedOutput = output.length > 60
                    ? output.substring(0, 60).replace(/\n/g, ' ') + '...'
                    : output.replace(/\n/g, ' ');
                  eventSummary = `Code Execution Result (${outcome}): ${truncatedOutput}`;
                  eventEmoji = outcome === 'OUTCOME_OK' ? '✅' : '❌';
                }
              }

              if (hasText) {
                // Show text preview in summary
                const textPart = adkEvent.content.parts.find(p => p.text);
                if (textPart && textPart.text) {
                  const text = textPart.text;
                  const truncated = text.length > 80
                    ? text.substring(0, 80) + '...'
                    : text;
                  eventSummary = `Text: "${truncated}"`;
                  eventEmoji = '💭';
                } else {
                  eventSummary = 'Text Response';
                  eventEmoji = '💭';
                }
              }

              if (hasAudio) {
                // Extract audio info for summary
                const audioPart = adkEvent.content.parts.find(p => p.inlineData);
                if (audioPart && audioPart.inlineData) {
                  const mimeType = audioPart.inlineData.mimeType || 'unknown';
                  const dataLength = audioPart.inlineData.data ? audioPart.inlineData.data.length : 0;
                  // Base64 string length / 4 * 3 gives approximate bytes
                  const byteSize = Math.floor(dataLength * 0.75);
                  eventSummary = `Audio Response: ${mimeType} (${byteSize.toLocaleString()} bytes)`;
                  eventEmoji = '🔊';
                } else {
                  eventSummary = 'Audio Response';
                  eventEmoji = '🔊';
                }

                // Log audio event with isAudio flag (filtered by checkbox)
                const sanitizedEvent = sanitizeEventForDisplay(adkEvent);
                addConsoleEntry('incoming', eventSummary, sanitizedEvent, eventEmoji, author, true);
              }
            }

            // Create a sanitized version for console display (replace large audio data with summary)
            // Skip if already logged as audio event above
            const isAudioOnlyEvent = adkEvent.content && adkEvent.content.parts &&
              adkEvent.content.parts.some(p => p.inlineData) &&
              !adkEvent.content.parts.some(p => p.text);
            if (!isAudioOnlyEvent) {
              const sanitizedEvent = sanitizeEventForDisplay(adkEvent);
              addConsoleEntry('incoming', eventSummary, sanitizedEvent, eventEmoji, author);
            }

            // Handle turn complete event - UPDATED WITH AUDIO RESET
            if (adkEvent.turnComplete === true) {
              // Safety reset: lift suppression so the next turn renders normally
              isAgentSuppressed = false;
              lastTurnCompleteTime = Date.now();

              // Remove typing indicator from current message
              if (currentBubbleElement) {
                const textElement = currentBubbleElement.querySelector(".bubble-text");
                const typingIndicator = textElement.querySelector(".typing-indicator");
                if (typingIndicator) {
                  typingIndicator.remove();
                }
              }
              // Remove typing indicator from current output transcription
              if (currentOutputTranscriptionElement) {
                const textElement = currentOutputTranscriptionElement.querySelector(".bubble-text");
                const typingIndicator = textElement.querySelector(".typing-indicator");
                if (typingIndicator) {
                  typingIndicator.remove();
                }
              }
              

              currentMessageId = null;
              currentBubbleElement = null;
              currentOutputTranscriptionId = null;
              currentOutputTranscriptionElement = null;
              inputTranscriptionFinished = false; // Reset for next turn
              return;
            }

            // Handle interrupted event (original + uses resetAudioPlayer for consistency)
            if (adkEvent.interrupted === true) {
              // Suppress all buffered agent output/audio arriving after this point
              isAgentSuppressed = true;

              // Stop audio playback if it's playing
              resetAudioPlayer();

              // Keep the partial message but mark it as interrupted
              if (currentBubbleElement) {
                const textElement = currentBubbleElement.querySelector(".bubble-text");

                // Remove typing indicator
                const typingIndicator = textElement.querySelector(".typing-indicator");
                if (typingIndicator) {
                  typingIndicator.remove();
                }

                // Add interrupted marker
                currentBubbleElement.classList.add("interrupted");
              }

              // Keep the partial output transcription but mark it as interrupted
              if (currentOutputTranscriptionElement) {
                const textElement = currentOutputTranscriptionElement.querySelector(".bubble-text");

                // Remove typing indicator
                const typingIndicator = textElement.querySelector(".typing-indicator");
                if (typingIndicator) {
                  typingIndicator.remove();
                }

                // Add interrupted marker
                currentOutputTranscriptionElement.classList.add("interrupted");
              }

              // Reset state so new content creates a new bubble
              currentMessageId = null;
              currentBubbleElement = null;
              currentOutputTranscriptionId = null;
              currentOutputTranscriptionElement = null;
              inputTranscriptionFinished = false; // Reset for next turn
              return;
            }

            // Handle input transcription (user's spoken words) - original
            if (adkEvent.inputTranscription && adkEvent.inputTranscription.text) {
              // User is speaking — lift suppression so agent can respond again
              isAgentSuppressed = false;

              const transcriptionText = adkEvent.inputTranscription.text;
              const isFinished = adkEvent.inputTranscription.finished;

              if (transcriptionText) {
                // Ignore late-arriving transcriptions after we've finished for this turn
                if (inputTranscriptionFinished) {
                  return;
                }

                if (currentInputTranscriptionId == null) {
                  // Create new transcription bubble
                  currentInputTranscriptionId = Math.random().toString(36).substring(7);
                  // Clean spaces between CJK characters
                  const cleanedText = cleanCJKSpaces(transcriptionText);
                  currentInputTranscriptionElement = createMessageBubble(cleanedText, true, !isFinished);
                  currentInputTranscriptionElement.id = currentInputTranscriptionId;

                  // Add a special class to indicate it's a transcription
                  currentInputTranscriptionElement.classList.add("transcription");

                  messagesDiv.appendChild(currentInputTranscriptionElement);
                } else {
                  // Update existing transcription bubble only if model hasn't started responding
                  // This prevents late partial transcriptions from overwriting complete ones
                  if (currentOutputTranscriptionId == null && currentMessageId == null) {
                    if (isFinished) {
                      // Final transcription contains the complete text, replace entirely
                      const cleanedText = cleanCJKSpaces(transcriptionText);
                      updateMessageBubble(currentInputTranscriptionElement, cleanedText, false);
                    } else {
                      // Partial transcription - append to existing text
                      const existingText = currentInputTranscriptionElement.querySelector(".bubble-text").textContent;
                      // Remove typing indicator if present
                      const cleanText = existingText.replace(/\.\.\.$/, '');
                      // Clean spaces between CJK characters before updating
                      const accumulatedText = cleanCJKSpaces(cleanText + transcriptionText);
                      updateMessageBubble(currentInputTranscriptionElement, accumulatedText, true);
                    }
                  }
                }

                // If transcription is finished, reset the state and mark as complete
                if (isFinished) {
                  currentInputTranscriptionId = null;
                  currentInputTranscriptionElement = null;
                  inputTranscriptionFinished = true; // Prevent duplicate bubbles from late events
                }

                scrollToBottom();
              }
            }

            // Handle output transcription (model's spoken words) - original
            if (adkEvent.outputTranscription && adkEvent.outputTranscription.text) {
              // Drop buffered transcription chunks that arrived after interrupted
              if (isAgentSuppressed) return;

              const transcriptionText = adkEvent.outputTranscription.text;
              const isFinished = adkEvent.outputTranscription.finished;

              if (transcriptionText) {
                // Finalize any active input transcription when server starts responding
                if (currentInputTranscriptionId != null && currentOutputTranscriptionId == null) {
                  // This is the first output transcription - finalize input transcription
                  const textElement = currentInputTranscriptionElement.querySelector(".bubble-text");
                  const typingIndicator = textElement.querySelector(".typing-indicator");
                  if (typingIndicator) {
                    typingIndicator.remove();
                  }
                  // Reset input transcription state so next user input creates new balloon
                  currentInputTranscriptionId = null;
                  currentInputTranscriptionElement = null;
                  inputTranscriptionFinished = true; // Prevent duplicate bubbles from late events
                }

                if (currentOutputTranscriptionId == null) {
                  // Create new transcription bubble for agent
                  currentOutputTranscriptionId = Math.random().toString(36).substring(7);
                  currentOutputTranscriptionElement = createMessageBubble(transcriptionText, false, !isFinished);
                  currentOutputTranscriptionElement.id = currentOutputTranscriptionId;

                  // Add a special class to indicate it's a transcription
                  currentOutputTranscriptionElement.classList.add("transcription");

                  messagesDiv.appendChild(currentOutputTranscriptionElement);
                } else {
                  // Update existing transcription bubble
                  if (isFinished) {
                    // Final transcription contains the complete text, replace entirely
                    updateMessageBubble(currentOutputTranscriptionElement, transcriptionText, false);
                  } else {
                    // Partial transcription - append to existing text
                    const existingText = currentOutputTranscriptionElement.querySelector(".bubble-text").textContent;
                    // Remove typing indicator if present
                    const cleanText = existingText.replace(/\.\.\.$/, '');
                    updateMessageBubble(currentOutputTranscriptionElement, cleanText + transcriptionText, true);
                  }
                }

                // If transcription is finished, reset the state
                if (isFinished) {
                  currentOutputTranscriptionId = null;
                  currentOutputTranscriptionElement = null;
                }

                scrollToBottom();
              }
            }

            // Handle content events (text or audio) - original
            if (adkEvent.content && adkEvent.content.parts) {
              // Drop buffered audio/text chunks that arrived after interrupted
              if (isAgentSuppressed) return;

              const parts = adkEvent.content.parts;

              // Finalize any active input transcription when server starts responding with content
              if (currentInputTranscriptionId != null && currentMessageId == null && currentOutputTranscriptionId == null) {
                // This is the first content event - finalize input transcription
                const textElement = currentInputTranscriptionElement.querySelector(".bubble-text");
                const typingIndicator = textElement.querySelector(".typing-indicator");
                if (typingIndicator) {
                  typingIndicator.remove();
                }
                // Reset input transcription state so next user input creates new balloon
                currentInputTranscriptionId = null;
                currentInputTranscriptionElement = null;
                inputTranscriptionFinished = true; // Prevent duplicate bubbles from late events
              }

              for (const part of parts) {
                // Handle inline data (audio)
                if (part.inlineData) {
                  const mimeType = part.inlineData.mimeType;
                  const data = part.inlineData.data;

                  if (mimeType && mimeType.startsWith("audio/pcm") && audioPlayerNode) {
                    audioPlayerNode.port.postMessage(base64ToArray(data));
                  }
                }

                // Handle text
                if (part.text) {
                  // Add a new message bubble for a new turn
                  if (currentMessageId == null) {
                    currentMessageId = Math.random().toString(36).substring(7);
                    currentBubbleElement = createMessageBubble(part.text, false, true);
                    currentBubbleElement.id = currentMessageId;
                    messagesDiv.appendChild(currentBubbleElement);
                  } else {
                    // Update the existing message bubble with accumulated text
                    const existingText = currentBubbleElement.querySelector(".bubble-text").textContent;
                    // Remove the "..." if present
                    const cleanText = existingText.replace(/\.\.\.$/, '');
                    updateMessageBubble(currentBubbleElement, cleanText + part.text, true);
                  }

                  // Scroll down to the bottom of the messagesDiv
                  scrollToBottom();
                }
              }
            }
          };

          // Handle connection close (original)
          websocket.onclose = function () {
            console.log("WebSocket connection closed.");
            updateConnectionStatus(false);
            document.getElementById("sendButton").disabled = true;
            addSystemMessage("Connection closed. Reconnecting in 5 seconds...");

            // Log to console
            addConsoleEntry('error', 'WebSocket Disconnected', {
              status: 'Connection closed',
              reconnecting: true,
              reconnectDelay: '5 seconds'
            }, '🔌', 'system');

            setTimeout(function () {
              console.log("Reconnecting...");

              // Log reconnection attempt to console
              addConsoleEntry('outgoing', 'Reconnecting to ADK server...', {
                userId: userId,
                sessionId: sessionId
              }, '🔄', 'system');

              connectWebsocket();
            }, 5000);
          };

          websocket.onerror = function (e) {
            console.log("WebSocket error: ", e);
            updateConnectionStatus(false);

            // Log to console
            addConsoleEntry('error', 'WebSocket Error', {
              error: e.type,
              message: 'Connection error occurred'
            }, '⚠️', 'system');
          };
        }
        connectWebsocket();
        // Connect the dedicated video WebSocket (separate lane from audio)
        function connectVideoWebsocket() {
          const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const videoUrl = wsProtocol + "//" + window.location.host + "/ws-video/" + userId + "/" + sessionId;
          videoWebsocket = new WebSocket(videoUrl);

          videoWebsocket.onopen = () => {
            console.log("[VIDEO WS] Connected — video frames will use dedicated lane");
          };

          videoWebsocket.onclose = () => {
            console.log("[VIDEO WS] Disconnected — reconnecting in 3s");
            setTimeout(connectVideoWebsocket, 3000);
          };

          videoWebsocket.onerror = (e) => {
            console.error("[VIDEO WS] Error:", e);
          };
        }
        connectVideoWebsocket();
        // Add submit handler to the form (original)
        function addSubmitHandler() {
          messageForm.onsubmit = function (e) {
            e.preventDefault();
            const message = messageInput.value.trim();
            if (message) {
              // Add user message bubble
              const userBubble = createMessageBubble(message, true, false);
              messagesDiv.appendChild(userBubble);
              scrollToBottom();

              // Clear input
              messageInput.value = "";

              // Send message to server
              sendMessage(message);
              console.log("[CLIENT TO AGENT] " + message);
            }
            return false;
          };
        }

        // Send a message to the server as JSON (original)
        function sendMessage(message) {
          if (websocket && websocket.readyState == WebSocket.OPEN) {
            const jsonMessage = JSON.stringify({
              type: "text",
              text: message
            });
            websocket.send(jsonMessage);

            // Log to console panel
            addConsoleEntry('outgoing', 'User Message: ' + message, null, '💬', 'user');
          }
        }

        // Decode Base64 data to Array (original)
        function base64ToArray(base64) {
          // Convert base64url to standard base64
          // Replace URL-safe characters: - with +, _ with /
          let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');

          // Add padding if needed
          while (standardBase64.length % 4) {
            standardBase64 += '=';
          }

          const binaryString = window.atob(standardBase64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes.buffer;
        }

        /**
         * Camera handling
         */

        const cameraButton = document.getElementById("cameraButton");
        const cameraModal = document.getElementById("cameraModal");
        const cameraPreview = document.getElementById("cameraPreview");
        const closeCameraModal = document.getElementById("closeCameraModal");
        const cancelCamera = document.getElementById("cancelCamera");
        const captureImageBtn = document.getElementById("captureImage");

        let cameraStream = null;
        let videoStreamInterval = null;
        let isCameraStreaming = false;

        // Open camera modal and start preview (original)
        async function openCameraPreview() {
          try {
            // Request access to the user's webcam
            cameraStream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
              }
            });

            // Set the stream to the video element
            cameraPreview.srcObject = cameraStream;

            // Show the modal
            cameraModal.classList.add('show');
            
            // START STREAMING TO AI
            startCameraStreaming();

          } catch (error) {
            console.error('Error accessing camera:', error);
            addSystemMessage(`Failed to access camera: ${error.message}`);

            // Log to console
            addConsoleEntry('error', 'Camera access failed', {
              error: error.message,
              name: error.name
            }, '⚠️', 'system');
          }
        }

        // Close camera modal and stop preview (original)
        function closeCameraPreview() {
          // STOP STREAMING FIRST
          stopCameraStreaming();
          
          // Stop the camera stream
          if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
          }

          // Clear the video source
          cameraPreview.srcObject = null;

          // Hide the modal
          cameraModal.classList.remove('show');
        }

        // Capture image from the live preview (original)
        function captureImageFromPreview() {
          if (!cameraStream) {
            addSystemMessage('No camera stream available');
            return;
          }

          try {
            // Create canvas to capture the frame
            const canvas = document.createElement('canvas');
            canvas.width = cameraPreview.videoWidth;
            canvas.height = cameraPreview.videoHeight;
            const context = canvas.getContext('2d');

            // Draw current video frame to canvas
            context.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);

            // Convert canvas to data URL for display
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);

            // Display the captured image in the chat
            const imageBubble = createImageBubble(imageDataUrl, true);
            messagesDiv.appendChild(imageBubble);
            scrollToBottom();

            // Convert canvas to blob for sending to server
            canvas.toBlob((blob) => {
              // Convert blob to base64 for sending to server
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result.split(',')[1]; // Remove data:image/jpeg;base64, prefix
                sendImage(base64data);
              };
              reader.readAsDataURL(blob);

              // Log to console
              addConsoleEntry('outgoing', `Image captured: ${blob.size} bytes (JPEG)`, {
                size: blob.size,
                type: 'image/jpeg',
                dimensions: `${canvas.width}x${canvas.height}`
              }, '📷', 'user');
            }, 'image/jpeg', 0.85);

            // Close the camera modal
            closeCameraPreview();

          } catch (error) {
            console.error('Error capturing image:', error);
            addSystemMessage(`Failed to capture image: ${error.message}`);

            // Log to console
            addConsoleEntry('error', 'Image capture failed', {
              error: error.message,
              name: error.name
            }, '⚠️', 'system');
          }
        }

        // Send image to server (original)
        function sendImage(base64Image) {
          if (websocket && websocket.readyState === WebSocket.OPEN) {
            const jsonMessage = JSON.stringify({
              type: "image",
              data: base64Image,
              mimeType: "image/jpeg"
            });
            websocket.send(jsonMessage);
            console.log("[CLIENT TO AGENT] Sent image");
          }
        }

        // Add these new functions for 1 FPS camera streaming (original)
        function startCameraStreaming() {
          if (!cameraStream || isCameraStreaming) {
            return;
          }
          
          isCameraStreaming = true;
          
          // Call this inside startCameraStreaming() to prime the model with scene context
          // (added exactly as requested - one-time initial frame capture with short delay for video readiness)
          setTimeout(() => {
            if (cameraPreview && cameraPreview.videoWidth > 0) {
              const canvas = document.createElement('canvas');
              canvas.width = cameraPreview.videoWidth;
              canvas.height = cameraPreview.videoHeight;
              const context = canvas.getContext('2d');
              context.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
              const frameMeta = analyzeFrame(canvas);
              sendFrameIntelligenceContext(frameMeta);
            }
          }, 500);

          // Send camera frame every 1000ms (1 FPS)
          videoStreamInterval = setInterval(() => {
            if (cameraStream && websocket && websocket.readyState === WebSocket.OPEN) {
              if (currentMessageId !== null || currentOutputTranscriptionId !== null) {
                console.debug('[CAMERA] Holding frame — agent still responding');
                return;
              }

              if (Date.now() - lastTurnCompleteTime < 3000) {
                console.debug('[CAMERA] Cooldown — waiting for user to speak before next frame');
                return;
              }

              captureAndSendFrame();
            }
          }, 1000);
          
          console.log('Started camera streaming at 1 FPS');
          addConsoleEntry('outgoing', 'Camera streaming started (1 FPS)', null, '📹', 'system');
        }

        function stopCameraStreaming() {
          if (videoStreamInterval) {
            clearInterval(videoStreamInterval);
            videoStreamInterval = null;
            isCameraStreaming = false;
            console.log('Stopped camera streaming');
            addConsoleEntry('outgoing', 'Camera streaming stopped', null, '⏹️', 'system');
          }
        }

        function captureAndSendFrame() {
          if (!cameraStream) return;

          try {
            // Create canvas to capture the frame
            const canvas = document.createElement('canvas');
            canvas.width = cameraPreview.videoWidth;
            canvas.height = cameraPreview.videoHeight;
            const context = canvas.getContext('2d');

            // Draw current video frame to canvas
            context.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);

            // ── INVISIBLE INTELLIGENCE LAYER ──
            // Analyze the frame for brightness, composition, colors, sharpness, tilt
            // The user never sees this — it's injected secretly with the frame
            const frameMeta = analyzeFrame(canvas);

            // Convert canvas to blob, then send with enriched metadata
            canvas.toBlob((blob) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                sendVideoFrame(base64data, frameMeta);
              };
              reader.readAsDataURL(blob);
            }, 'image/jpeg', 0.92);

          } catch (error) {
            console.error('Error capturing frame:', error);
          }
        }
        function sendVideoFrame(base64Image, frameMeta = null) {
          const hasConnection = (videoWebsocket && videoWebsocket.readyState === WebSocket.OPEN)
            || (websocket && websocket.readyState === WebSocket.OPEN);
          if (!hasConnection) return;

          let payload;

          if (frameMeta) {
            // ── ENRICHED PATH: inject invisible frame intelligence ──
            payload = buildEnrichedPayload(base64Image, frameMeta, 'image/jpeg');

            // Log intelligence to console (dev only — can remove in production)
            console.debug(
              `[FRAME INTEL] 💡 brightness:${frameMeta.brightness}% | ` +
              `composition:${frameMeta.composition}/100 | ` +
              `sharpness:${frameMeta.sharpness}/100 | ` +
              `colors:[${frameMeta.dominantColors.join(',')}] | ` +
              `tilt:${frameMeta.tiltDegrees}° | ` +
              `scene:${frameMeta.sceneCategory}`
            );
          } else {
            // ── FALLBACK PATH: plain frame (backward compatible) ──
            payload = {
              type: "video_frame",
              data: base64Image,
              mimeType: "image/jpeg"
            };
          }

          const targetSocket = (videoWebsocket && videoWebsocket.readyState === WebSocket.OPEN)
            ? videoWebsocket
            : websocket; // fallback to main socket if video socket not ready
          targetSocket.send(JSON.stringify(payload));
        }

        // Call this inside startCameraStreaming() to prime the model with scene context
        function sendFrameIntelligenceContext(frameMeta) {
          if (!websocket || websocket.readyState !== WebSocket.OPEN || !frameMeta) return;

          // Build a natural language briefing from the metadata
          const parts = [];

          if (frameMeta.brightness < 35) {
            parts.push(`The scene is quite dark (brightness: ${frameMeta.brightness}%)`);
          } else if (frameMeta.brightness > 80) {
            parts.push(`The scene is brightly lit / possibly overexposed (brightness: ${frameMeta.brightness}%)`);
          }

          if (frameMeta.dominantColors.length > 0) {
            parts.push(`Dominant colors visible: ${frameMeta.dominantColors.join(', ')}`);
          }

          if (frameMeta.sceneCategory !== 'general') {
            parts.push(`Scene type detected: ${frameMeta.sceneCategory}`);
          }

          if (Math.abs(frameMeta.tiltDegrees) > 8) {
            parts.push(`Camera appears tilted ${Math.abs(frameMeta.tiltDegrees)}° to the ${frameMeta.tiltDegrees > 0 ? 'left' : 'right'}`);
          }

          // Only send if there's useful context to share
          if (parts.length === 0) return;

          const contextMessage = `[Camera just activated. Scene analysis: ${parts.join('. ')}.] Please acknowledge what you see.`;

          websocket.send(JSON.stringify({
            type: "text",
            text: contextMessage
          }));
        }

        // Event listeners for camera (original)
        cameraButton.addEventListener("click", openCameraPreview);
        closeCameraModal.addEventListener("click", closeCameraPreview);
        cancelCamera.addEventListener("click", closeCameraPreview);
        captureImageBtn.addEventListener("click", captureImageFromPreview);

        // Close modal when clicking outside of it
        cameraModal.addEventListener("click", (event) => {
          if (event.target === cameraModal) {
            closeCameraPreview();
          }
        });

        /**
         * Audio handling
         */

        let audioPlayerNode;
        let audioPlayerContext;
        let audioRecorderNode;
        let audioRecorderContext;
        let micStream;

        // Import the audio worklets
        import { startAudioPlayerWorklet } from "./audio-player.js";
        import { startAudioRecorderWorklet } from "./audio-recorder.js";
        import { analyzeFrame, buildEnrichedPayload } from './FrameIntelligence.js';
        // Start audio (original)
        function startAudio() {
          // Start audio output
          startAudioPlayerWorklet().then(([node, ctx]) => {
            audioPlayerNode = node;
            audioPlayerContext = ctx;
          });
          // Start audio input
          startAudioRecorderWorklet(audioRecorderHandler).then(
            ([node, ctx, stream]) => {
              audioRecorderNode = node;
              audioRecorderContext = ctx;
              micStream = stream;
            }
          );
        }

        // Start the audio only when the user clicked the button
        const startAudioButton = document.getElementById("startAudioButton");
        startAudioButton.addEventListener("click", () => {
          startAudioButton.disabled = true;
          startAudio();
          is_audio = true;
          addSystemMessage("Audio mode enabled - you can now speak to the agent");

          // Log to console
          addConsoleEntry('outgoing', 'Audio Mode Enabled', {
            status: 'Audio worklets started',
            message: 'Microphone active - audio input will be sent to agent'
          }, '🎤', 'system');
        });

        // NEW: Reset audio player (used on turn complete / interrupted)
        function resetAudioPlayer() {
          if (audioPlayerNode) {
            try {
              audioPlayerNode.port.postMessage({ command: "endOfAudio" });
              
              // If audio context is suspended, resume it
              if (audioPlayerContext && audioPlayerContext.state === 'suspended') {
                audioPlayerContext.resume().then(() => {
                  console.log('Audio context resumed');
                  addConsoleEntry('outgoing', 'Audio context resumed', null, '🔊', 'system');
                });
              }
            } catch (error) {
              console.error('Error resetting audio player:', error);
            }
          }
        }

        // UPDATED Audio recorder handler - now tracks lastAudioTime
        function audioRecorderHandler(pcmData) {
          if (websocket && websocket.readyState === WebSocket.OPEN && is_audio) {
            // Update last audio time (critical for recovery detection)
            lastAudioTime = Date.now();

            // Send audio as binary WebSocket frame (more efficient than base64 JSON)
            websocket.send(pcmData);
            console.log("[CLIENT TO AGENT] Sent audio chunk: %s bytes", pcmData.byteLength);

            // Log to console panel (optional, can be noisy with frequent audio chunks)
            // addConsoleEntry('outgoing', `Audio chunk: ${pcmData.byteLength} bytes`);
          }
        }

        // NEW: Full audio recovery system
        function checkAndRecoverAudio() {
          const timeSinceLastAudio = Date.now() - lastAudioTime;
          
          // If no audio sent for more than 3 seconds while audio is enabled
          if (is_audio && timeSinceLastAudio > 3000) {
            console.warn('Audio worklet appears stuck, attempting recovery...');
            addConsoleEntry('error', 'Audio worklet stuck, recovering...', {
              timeSinceLastAudio: `${timeSinceLastAudio}ms`
            }, '⚠️', 'system');
            
            // Try to restart audio recorder
            restartAudioRecorder();
          }
        }

        async function restartAudioRecorder() {
          try {
            // Stop existing recorder
            if (audioRecorderNode) {
              audioRecorderNode.port.close();
              audioRecorderNode.disconnect();
            }
            if (micStream) {
              micStream.getTracks().forEach(track => track.stop());
            }
            
            // Restart recorder
            const [node, ctx, stream] = await startAudioRecorderWorklet(audioRecorderHandler);
            audioRecorderNode = node;
            audioRecorderContext = ctx;
            micStream = stream;
            
            lastAudioTime = Date.now(); // Reset timer
            
            console.log('Audio recorder restarted successfully');
            addConsoleEntry('outgoing', 'Audio recorder restarted', null, '🎤', 'system');
            addSystemMessage('Microphone reconnected');
            
          } catch (error) {
            console.error('Failed to restart audio recorder:', error);
            addConsoleEntry('error', 'Failed to restart audio', {
              error: error.message
            }, '⚠️', 'system');
            addSystemMessage('Microphone error - please refresh page');
          }
        }
          // Check audio health every 5 seconds (MUST be after function definitions!)
        // Start audio recovery monitoring (after all functions are defined)
        setInterval(checkAndRecoverAudio, 5000);
        console.log('Audio recovery monitoring started');

        // Optional debug button (uncomment the HTML button above to use)
        /*
        document.getElementById('checkAudioStatus').addEventListener('click', () => {
          if (audioPlayerContext) {
            console.log('Audio Player Context State:', audioPlayerContext.state);
            console.log('Audio Player Node:', audioPlayerNode ? 'Active' : 'Inactive');
            addSystemMessage(`Audio: ${audioPlayerContext.state}, Node: ${audioPlayerNode ? 'Active' : 'Inactive'}`);
            
            if (audioPlayerContext.state === 'suspended') {
              audioPlayerContext.resume().then(() => {
                addSystemMessage('Audio context resumed!');
              });
            }
          } else {
            addSystemMessage('Audio not initialized');
          }
            
        });
        */
// /quokk/js/view-book.js
(function () {
  function initBookView({ viewRoot } = {}) {
    const view = viewRoot?.querySelector('.spa-view[data-spa-view="book"]');
    if (!view) return;

    const hireChat = view.querySelector('[data-hire-chat]');
    if (!hireChat) return;

    const scrollRoot = viewRoot || window;

    // ===============================
    // ✅ Google Apps Script(Web App) 설정
    // ===============================
    // 1) Apps Script "웹 앱" 배포 후 발급되는 URL(…/exec)
    const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzLr9x3LQSnIXhc7I6YNqk2-Io4ynpJaDCm8DtXYxU0it79ZKAjsOK5JAi14VMhorkjag/exec';
    // 2) Apps Script의 SECRET과 동일하게
    const GAS_SECRET = 'CHANGE_ME_RANDOM';

    let activeScenario = null;
    const scenarioThreads = Array.from(view.querySelectorAll('.chat-thread[data-scenario-thread]'));
    const threadContainer = view.querySelector('[data-chat-threads]');
    const userContext = { name: '', role: '', brand: '' };
    const summaryData = {};
    const summaryOrder = [];
    const summaryLabels = {
      scenario: '상담 카테고리',
    };
    const scenarioPrefixes = {
      lookbook: /^lookbook-/,
      contents: /^contents-/,
      product: /^product-/,
      website: /^website-/,
    };
    const summaryModal = document.querySelector('[data-summary-modal]');
    const summaryOutput = summaryModal?.querySelector('[data-summary-output]');
    const summaryOpenBtn = view.querySelector('[data-summary-open]');
    const summaryWrap = view.querySelector('.chat-summary');
    const summaryCloseBtns = summaryModal?.querySelectorAll('[data-summary-close]');

    relocateQuestionIcons(view);
    updateUserPlaceholders();
    setupDatePickers(view);
    setupPhoneValidation(view);
    setupSummaryModal();

    scenarioThreads.forEach((thread) => {
      const key = thread.dataset.scenarioThread;
      thread._chatBlocks = Array.from(thread.querySelectorAll('[data-chat-block]'));
    });

    const TIMING = {
      autoHold: 450,
      typingDelay: 1000,
      answerDelay: 450,
      focusDelay: 600,
      nextDelay: 700,
    };

    const leadBlocks = Array.from(view.querySelectorAll('[data-sequence="lead"] [data-chat-block]'));
    prepareBlocks(leadBlocks);
    startSequence(leadBlocks);

    scenarioThreads.forEach((thread) =>
      prepareBlocks(thread._chatBlocks, {
        onComplete: () => showSummaryButton(),
      }),
    );

    hideSummaryButton();

    function pruneSummaryForScenario(nextScenario) {
      const matcher = scenarioPrefixes[nextScenario];
      if (!matcher) return;
      const keep = new Set(['scenario', 'lead-name', 'lead-role', 'lead-brand']);
      Object.keys(summaryData).forEach((key) => {
        if (keep.has(key) || matcher.test(key)) return;
        delete summaryData[key];
      });
      for (let i = summaryOrder.length - 1; i >= 0; i -= 1) {
        const key = summaryOrder[i];
        if (keep.has(key) || matcher.test(key)) continue;
        summaryOrder.splice(i, 1);
      }
    }

    function activateScenario(key) {
      if (!key) return;
      activeScenario = key;
      threadContainer?.classList.add('is-active');
      hideSummaryButton();
      scenarioThreads.forEach((thread) => {
        const match = thread.dataset.scenarioThread === key;
        thread.classList.toggle('is-active', match);
        if (match) startSequence(thread._chatBlocks);
      });
    }

    function prepareBlocks(blocks, opts = {}) {
      blocks.forEach((block, idx) => {
        block._chatNext = blocks[idx + 1] || null;
        block._sequenceOptions = opts;
        block._chatQuestion = block.querySelector('[data-chat-question]') || null;
        block._chatAnswer = block.querySelector('[data-chat-answer]') || null;
        block._chatEcho = block.querySelector('[data-chat-echo]') || null;
        attachInteractions(block);
      });
    }

    function attachInteractions(block) {
      if (block._chatPrepared) return;
      block._chatPrepared = true;
      const trigger = block.dataset.trigger;

      if (trigger === 'text') {
        const input = block._chatAnswer?.querySelector('input, textarea');
        const submit = block._chatAnswer?.querySelector('[data-chat-confirm]');
        const commit = () => {
          const value = input?.value?.trim();
          if (!value) return;
          const nextBlock = completeBlock(block, value);
          scheduleNext(nextBlock);
        };
        const handleUpdate = () => {
          if (block.dataset.completed !== '1') return;
          const value = input?.value?.trim();
          if (!value) return;
          renderEcho(block, value);
          updateSummary(block, value);
        };
        input?.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter' && !evt.shiftKey) {
            evt.preventDefault();
            commit();
          }
        });
        input?.addEventListener('change', handleUpdate);
        submit?.addEventListener('click', commit);
      } else if (trigger === 'option') {
        const inputs = block._chatAnswer?.querySelectorAll('input[type="radio"], input[type="checkbox"]') || [];
        const requireConfirm = block.dataset.requireConfirm === 'true';
        const submit = block._chatAnswer?.querySelector('[data-chat-confirm]');
        const collect = () => {
          const selected = Array.from(inputs).filter((el) => el.checked);
          if (!selected.length) return '';
          return selected.map((el) => el.closest('label')?.innerText.trim() || el.value).join(', ');
        };
        const commit = () => {
          const value = collect();
          if (!value) return;
          if (block.dataset.completed === '1') {
            renderEcho(block, value);
            updateSummary(block, value);
          } else {
            const nextBlock = completeBlock(block, value);
            scheduleNext(nextBlock);
          }
        };
        if (requireConfirm) {
          submit?.addEventListener('click', commit);
        } else {
          inputs.forEach((input) => input.addEventListener('change', commit));
        }
      } else if (trigger === 'scenario') {
        const inputOptions =
          block._chatAnswer?.querySelectorAll('input[type="radio"][data-scenario-option]') || [];
        if (inputOptions.length) {
          inputOptions.forEach((input) => {
            input.addEventListener('change', () => {
              if (!input.checked) return;
              const key = input.dataset.scenarioOption;
              if (!key) return;
              if (activeScenario && activeScenario !== key) {
                pruneSummaryForScenario(key);
              }
              const label =
                input.dataset.optionLabel ||
                input.closest('label')?.innerText.trim() ||
                input.value;
              if (block.dataset.completed === '1') {
                renderEcho(block, label);
                updateSummary(block, label);
              } else {
                const nextBlock = completeBlock(block, label);
                scheduleNext(nextBlock);
              }
              activateScenario(key);
              scrollToLatest(input.closest('.chat-message') || input);
            });
          });
        } else {
          const options = block._chatAnswer?.querySelectorAll('[data-scenario-option]') || [];
          options.forEach((btn) => {
            btn.addEventListener('click', () => {
              const key = btn.dataset.scenarioOption;
              if (!key) return;
              if (activeScenario && activeScenario !== key) {
                pruneSummaryForScenario(key);
              }
              highlightScenarioChoice(options, btn);
              const label = btn.dataset.optionLabel || btn.textContent.trim();
              if (block.dataset.completed === '1') {
                renderEcho(block, label);
                updateSummary(block, label);
              } else {
                const nextBlock = completeBlock(block, label);
                scheduleNext(nextBlock);
              }
              activateScenario(key);
              scrollToLatest(btn.closest('.chat-message') || btn);
            });
          });
        }
      } else if (trigger === 'identity') {
        setupIdentityBlock(block);
      }
    }

    function resetBlock(block) {
      block.classList.remove('is-visible');
      block.dataset.completed = '';
      if (block._typingTimer) {
        clearTimeout(block._typingTimer);
        block._typingTimer = null;
      }
      if (block._typingOriginal != null) {
        const bubble = block._chatQuestion?.querySelector('.chat-bubble');
        if (bubble) {
          bubble.innerHTML = block._typingOriginal;
          bubble.classList.remove('chat-bubble--typing');
        }
        block._typingOriginal = null;
      }
      block._chatQuestion?.classList.remove('is-visible');
      block._chatAnswer?.classList.remove('is-visible', 'is-complete');
      block._chatEcho?.classList.remove('is-visible');
      block._chatAnswer?.querySelectorAll('input[type="text"], input[type="date"], textarea').forEach((el) => (el.value = ''));
      block._chatAnswer?.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((el) => (el.checked = false));
      const multiStack = block._chatAnswer?.querySelector('[data-multi-stack]');
      if (multiStack) {
        multiStack.dataset.ready = '';
        block._chatAnswer
          ?.querySelectorAll('[data-multi-field]')
          .forEach((field, idx) => {
            field.dataset.locked = '';
            field.classList.remove('is-locked');
            const input = field.querySelector('input');
            if (input) input.readOnly = false;
            if (idx === 0) {
              field.hidden = false;
              field.classList.add('is-active');
            } else {
              field.hidden = true;
              field.classList.remove('is-active');
            }
          });
      }
    }

    function startSequence(blocks) {
      if (!blocks?.length) return;
      blocks.forEach(resetBlock);
      revealBlock(blocks[0]);
    }

    function revealBlock(block) {
      if (!block) return;
      block.classList.add('is-visible');
      const questionDelay = block._chatQuestion ? showTypingBubble(block) : 0;
      if (!block._chatQuestion) {
        scrollToLatest(block, { immediate: true });
      }
      if (block.dataset.autoNext === 'true') {
        const baseAuto = Number(block.dataset.autoDelay || '');
        const autoDelay = Number.isFinite(baseAuto) && baseAuto >= 0 ? baseAuto : TIMING.autoHold;
        const run = () => {
          const nextBlock = completeBlock(block, null);
          scheduleNext(nextBlock);
        };
        setTimeout(run, questionDelay + autoDelay);
        return;
      }
      if (block._chatAnswer) {
        setTimeout(() => {
          block._chatAnswer.classList.add('is-visible');
          scrollToLatest(block._chatAnswer);
        }, questionDelay + TIMING.answerDelay);
        const firstInput = block._chatAnswer.querySelector('input, textarea');
        if (firstInput) {
          setTimeout(() => firstInput.focus({ preventScroll: true }), questionDelay + TIMING.focusDelay);
        }
      }
    }

    function completeBlock(block, valueText) {
      if (block.dataset.completed === '1') return;
      block.dataset.completed = '1';
      block._chatAnswer?.classList.add('is-complete');
      if (valueText) {
        updateSummary(block, valueText);
        renderEcho(block, valueText);
      }
      const next = block._chatNext;
      if (!next && typeof block._sequenceOptions?.onComplete === 'function') {
        block._sequenceOptions.onComplete();
      }
      return next;
    }

    function renderEcho(block, valueText) {
      const echo = block._chatEcho;
      if (!echo) return;
      const template = block.dataset.echoTemplate || '{answer}';
      const emoji = block.dataset.echoEmoji || '🙂';
      const message = template.replace('{answer}', valueText);
      const emojiEl = echo.querySelector('[data-echo-emoji]');
      const textEl = echo.querySelector('[data-echo-text]');
      if (emojiEl) emojiEl.textContent = emoji;
      if (textEl) textEl.textContent = message;
      echo.classList.add('is-visible');
      scrollToLatest(echo);
    }

    function highlightScenarioChoice(options, activeBtn) {
      options.forEach((btn) => btn.classList.toggle('is-selected', btn === activeBtn));
    }

    function setupIdentityBlock(block) {
      const stack = block._chatAnswer?.querySelector('[data-multi-stack]');
      if (!stack) return;
      const fields = Array.from(stack.querySelectorAll('[data-multi-field]'));
      if (!fields.length) return;
      const submit = stack.querySelector('[data-multi-submit]');
      const values = {};
      let currentIndex = 0;

      const getFieldKey = (field, idx) => {
        const input = field?.querySelector('input');
        return input?.dataset.fieldKey || `field${idx + 1}`;
      };

      const syncValuesFromInputs = () => {
        fields.forEach((field, idx) => {
          const input = field.querySelector('input');
          const key = getFieldKey(field, idx);
          values[key] = (input?.value || '').trim();
        });
      };

      const applyIdentityUpdate = () => {
        syncValuesFromInputs();
        userContext.name = values.name || '';
        userContext.role = values.role || '';
        userContext.brand = values.brand || '';
        updateUserPlaceholders();
        setSummaryValue('lead-name', '담당자', values.name || '');
        setSummaryValue('lead-role', '담당 역할', values.role || '');
        setSummaryValue('lead-brand', '브랜드이름', values.brand || '');

        const template = block.dataset.identityTemplate || '{name} {role} {brand}';
        const message = template
          .replace('{name}', values.name || '')
          .replace('{role}', values.role || '')
          .replace('{brand}', values.brand || '')
          .replace(/\s+/g, ' ')
          .trim();

        if (block.dataset.completed === '1') {
          if (message) renderEcho(block, message);
          return null;
        }

        if (!message) return null;
        const nextBlock = completeBlock(block, message);
        scheduleNext(nextBlock);
        return nextBlock;
      };

      fields.forEach((field, idx) => {
        const input = field.querySelector('input');
        if (idx > 0) {
          field.hidden = true;
          field.classList.remove('is-active');
        } else {
          field.hidden = false;
          field.classList.add('is-active');
        }
        input?.addEventListener('keydown', (evt) => {
          const locked = field.dataset.locked === '1';
          if (evt.key === 'Enter' && !evt.shiftKey) {
            if (locked) return;
            evt.preventDefault();
            advanceField(idx);
            return;
          }
          if (evt.key === 'Tab' && !evt.shiftKey) {
            if (locked) return;
            evt.preventDefault();
            advanceField(idx);
          }
        });

        input?.addEventListener('focus', () => {
          if (field.dataset.locked === '1') {
            field.classList.remove('is-locked');
            field.classList.add('is-active');
            input.readOnly = false;
          }
        });

        input?.addEventListener('blur', () => {
          if (field.dataset.locked === '1') {
            field.classList.remove('is-active');
            field.classList.add('is-locked');
            input.readOnly = true;
          }
          if (block.dataset.completed === '1') applyIdentityUpdate();
        });

        input?.addEventListener('change', () => {
          if (block.dataset.completed === '1') applyIdentityUpdate();
        });
      });

      submit?.addEventListener('click', () => {
        if (stack.dataset.ready === 'true') {
          applyIdentityUpdate();
        } else {
          advanceField(currentIndex);
        }
      });

      function advanceField(idx) {
        const field = fields[idx];
        if (!field || field.dataset.locked === '1') return;
        const input = field.querySelector('input');
        const value = input?.value?.trim();
        if (!value) return;
        const key = input?.dataset.fieldKey || `field${idx + 1}`;
        values[key] = value;
        field.dataset.locked = '1';
        field.classList.remove('is-active');
        field.classList.add('is-locked');
        if (input) input.readOnly = true;
        const nextField = fields[idx + 1];
        if (nextField) {
          nextField.hidden = false;
          requestAnimationFrame(() => {
            nextField.classList.add('is-active');
            const nextInput = nextField.querySelector('input');
            nextInput?.focus({ preventScroll: true });
          });
          currentIndex = idx + 1;
        } else {
          stack.dataset.ready = 'true';
          applyIdentityUpdate();
        }
      }
    }

    function relocateQuestionIcons(root) {
      const questions = root.querySelectorAll('[data-chat-question]');
      questions.forEach((question) => {
        const avatar = question.querySelector('.chat-avatar');
        if (!avatar) return;
        const icon = avatar.textContent.trim();
        const bubble = question.querySelector('.chat-bubble');
        if (bubble && icon) {
          const target = bubble.querySelector('p:not(.chat-bubble__label):not(.chat-bubble__step)');
          if (target && !target.textContent.includes(icon)) {
            const base = target.textContent.trim();
            target.textContent = `${base} ${icon}`.trim();
          }
        }
        avatar.remove();
      });
    }

    function updateUserPlaceholders() {
      const nodes = view.querySelectorAll('[data-user-template]');
      nodes.forEach((node) => {
        const template = node.dataset.userTemplate;
        if (!node.dataset.userDefault) {
          node.dataset.userDefault = node.textContent.trim();
        }
        if (template && userContext.name) {
          node.textContent = template.replace('{name}', userContext.name);
        } else {
          node.textContent = node.dataset.userDefault || node.textContent;
        }
      });
    }

    function setupDatePickers(root) {
      const fields = root.querySelectorAll('[data-date-field]');
      fields.forEach((field) => {
        const input = field.querySelector('input[type="date"]');
        if (!input) return;
        const openPicker = () => {
          input.focus({ preventScroll: true });
          if (typeof input.showPicker === 'function') {
            try {
              input.showPicker();
              return;
            } catch (err) {}
          }
          input.click();
        };
        field.addEventListener('click', (evt) => {
          if (evt.target === input) return;
          evt.preventDefault();
          openPicker();
        });
        ['mousedown', 'touchstart'].forEach((evtName) => {
          input.addEventListener(evtName, (evt) => {
            evt.preventDefault();
            openPicker();
          });
        });
      });
    }

    function setupPhoneValidation(root) {
      const inputs = Array.from(root.querySelectorAll('input[name$="-phone"]'));
      if (!inputs.length) return;
      inputs.forEach((input) => {
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('pattern', '[0-9]*');
        input.setAttribute('autocomplete', 'tel');
        const field = input.closest('.chat-card__field') || input.parentElement;
        let error = field?.querySelector('.chat-field-error');
        if (!error && field) {
          error = document.createElement('p');
          error.className = 'chat-field-error';
          error.textContent = '숫자만 입력해주세요.';
          error.hidden = true;
          field.appendChild(error);
        }
        const showError = () => {
          if (error) error.hidden = false;
        };
        const hideError = () => {
          if (error) error.hidden = true;
        };
        input.addEventListener('input', () => {
          const raw = input.value || '';
          const sanitized = raw.replace(/\D+/g, '');
          if (raw !== sanitized) {
            input.value = sanitized;
            showError();
          } else {
            hideError();
          }
        });
        input.addEventListener('blur', () => {
          const raw = input.value || '';
          if (/\D/.test(raw)) {
            showError();
          } else {
            hideError();
          }
        });
      });
    }

    // ===============================
    // ✅ 요약 텍스트(상담내용) 만들기 + 연락처 자동 추출
    // ===============================
    function pickPhoneFromSummary() {
      return (
        summaryData['lookbook-phone']?.value ||
        summaryData['contents-phone']?.value ||
        summaryData['product-phone']?.value ||
        summaryData['website-phone']?.value ||
        ''
      );
    }

    // 브랜드이름/카테고리/담당 역할/담당자/연락처는 별도 컬럼이므로 제외
    function buildDetailsText() {
      const exclude = new Set([
        'scenario',
        'lead-name',
        'lead-role',
        'lead-brand',
        'lookbook-phone',
        'contents-phone',
        'product-phone',
        'website-phone',
      ]);

      const lines = summaryOrder
        .filter((key) => !exclude.has(key))
        .map((key) => summaryData[key])
        .filter((entry) => entry?.value)
        .map((entry) => `${entry.label}: ${entry.value}`);

      return lines.length ? lines.join('\n') : '';
    }

    function buildSendPacket() {
      const brand = (summaryData['lead-brand']?.value || userContext.brand || '').trim();
      const category = (summaryData['scenario']?.value || '').trim();
      const role = (summaryData['lead-role']?.value || userContext.role || '').trim();
      const manager = (summaryData['lead-name']?.value || userContext.name || '').trim();
      const phone = (pickPhoneFromSummary() || '').trim();
      const details = (buildDetailsText() || '').trim();

      return {
        brand,
        category,
        role,
        manager,
        phone,
        details,
        pageUrl: location.href,
      };
    }

    // CORS 영향을 피하기 위해 hidden form POST 사용
    function postToGAS(packet) {
      if (!GAS_ENDPOINT || GAS_ENDPOINT.indexOf('script.google.com') === -1) return;

      let iframe = document.querySelector('iframe[name="_quok_gas_hidden"]');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.name = '_quok_gas_hidden';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = GAS_ENDPOINT;
      form.target = '_quok_gas_hidden';

      const payload = {
        secret: GAS_SECRET,
        brand: packet.brand,
        category: packet.category,
        role: packet.role,
        manager: packet.manager,
        phone: packet.phone,
        details: packet.details,
        pageUrl: packet.pageUrl,
      };

      Object.entries(payload).forEach(([k, v]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = k;
        input.value = String(v ?? '');
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
      form.remove();
    }

    // ===============================
    // ✅ "전송 내용 확인" 클릭 시: 모달 오픈 + 실제 전송
    // ===============================
    function setupSummaryModal() {
      summaryOpenBtn?.addEventListener('click', () => {
        // 1) 모달에 표시할 텍스트
        const text = buildSummaryText();
        if (summaryOutput) summaryOutput.textContent = text;
        summaryModal?.removeAttribute('hidden');

        // 2) 실제 전송(시트 저장 + Gmail 발송)
        const packet = buildSendPacket();

        // 필수: 브랜드이름/카테고리/담당자/연락처
        const missing = [];
        if (!packet.brand) missing.push('브랜드이름');
        if (!packet.category) missing.push('카테고리');
        if (!packet.manager) missing.push('담당자');
        if (!packet.phone) missing.push('연락처');

        if (missing.length) {
          // 모달 내용에 안내를 덧붙임(원하면 UI 별도 처리 가능)
          if (summaryOutput) {
            summaryOutput.textContent =
              text +
              '\n\n' +
              `※ 전송 불가(필수 누락): ${missing.join(', ')}\n` +
              '필수 항목을 입력/선택한 뒤 다시 시도해주세요.';
          }
          return;
        }

        // 상담내용(details)이 비어있어도 전송은 되게(원하면 필수로 바꿀 수 있음)
        postToGAS(packet);

        // 사용자가 "확인"을 눌렀다는 행위 자체가 전송이므로, 모달 상단에 문구 추가
        if (summaryOutput) {
          summaryOutput.textContent =
            text +
            '\n\n' +
            '—\n' +
            '전송이 접수되었습니다. 담당자가 확인 후 연락드리겠습니다.';
        }
      });

      summaryCloseBtns?.forEach((btn) =>
        btn.addEventListener('click', () => {
          summaryModal?.setAttribute('hidden', 'hidden');
          location.hash = '#/home';
        }),
      );
    }

    function buildSummaryText() {
      const parts = summaryOrder
        .map((key) => summaryData[key])
        .filter((entry) => entry?.value)
        .map((entry) => `${entry.label}: ${entry.value}`);
      return parts.length ? parts.join('\n') : '아직 입력된 내용이 없습니다.';
    }

    function updateSummary(block, value) {
      const key = block?.dataset.summaryKey;
      if (!key || !value) return;
      const label = summaryLabels[key] || block.dataset.summaryLabel || key;
      setSummaryValue(key, label, value);
    }

    function setSummaryValue(key, label, value) {
      if (!key) return;
      const resolvedLabel = label || summaryLabels[key] || key;
      summaryData[key] = { label: resolvedLabel, value };
      if (!summaryOrder.includes(key)) summaryOrder.push(key);
    }

    function showTypingBubble(block) {
      const question = block._chatQuestion;
      if (!question) return 0;
      const bubble = question.querySelector('.chat-bubble');
      if (!bubble) {
        question.classList.add('is-visible');
        return 0;
      }
      if (block._typingTimer) {
        clearTimeout(block._typingTimer);
        block._typingTimer = null;
      }
      if (block._typingOriginal == null) {
        block._typingOriginal = bubble.innerHTML;
      }
      bubble.classList.add('chat-bubble--typing');
      bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
      question.classList.add('is-visible');
      scrollToLatest(question, { immediate: true });
      const duration = TIMING.typingDelay * 1.4;
      block._typingTimer = setTimeout(() => {
        bubble.classList.remove('chat-bubble--typing');
        if (block._typingOriginal != null) {
          bubble.innerHTML = block._typingOriginal;
          block._typingOriginal = null;
        }
        bubble.classList.add('chat-bubble--reveal');
        requestAnimationFrame(() => bubble.classList.add('chat-bubble--reveal-active'));
        setTimeout(() => {
          bubble.classList.remove('chat-bubble--reveal', 'chat-bubble--reveal-active');
        }, 420);
        scrollToLatest(question);
        block._typingTimer = null;
      }, duration);
      return duration;
    }

    function scrollToLatest(node, { immediate = false } = {}) {
      if (!node) return;
      const run = () => {
        if (!document.body.contains(node)) return;
        const isWindow = scrollRoot === window;
        if (isWindow) {
          const rect = node.getBoundingClientRect();
          const viewport = window.innerHeight || document.documentElement.clientHeight;
          const currentCenter = rect.top + window.scrollY;
          const targetTop = currentCenter - viewport * 0.55;
          const clamped = Math.max(0, targetTop);
          window.scrollTo({ top: clamped, behavior: 'smooth' });
        } else if (scrollRoot) {
          const containerRect = scrollRoot.getBoundingClientRect();
          const nodeRect = node.getBoundingClientRect();
          const offsetTop = nodeRect.top - containerRect.top + scrollRoot.scrollTop;
          const target = offsetTop - scrollRoot.clientHeight * 0.55;
          scrollRoot.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
        }
      };
      if (immediate) {
        run();
      } else {
        requestAnimationFrame(run);
      }
    }

    function scheduleNext(block, delay = TIMING.nextDelay) {
      if (!block) return;
      setTimeout(() => revealBlock(block), delay);
    }

    function hideSummaryButton() {
      if (!summaryWrap) return;
      summaryWrap.classList.remove('is-visible');
    }

    function showSummaryButton() {
      if (!summaryWrap) return;
      summaryWrap.classList.add('is-visible');
      scrollToLatest(summaryWrap);
    }
  }

  window.quokViewModules = window.quokViewModules || {};
  window.quokViewModules.book = initBookView;
})();

(() => {
    const STORAGE_KEY = 'td.todos.v2';

    /** @type {{ id: string; title: string; completed: boolean; createdAt: number; dueAt: number|null; priority: 'none'|'low'|'medium'|'high'; tags: string[]; projectId: string|null; subtasks: { id: string; title: string; completed: boolean }[]; recurrence?: { type: 'daily'|'weekly'|'monthly'; interval: number; count?: number; } }[]} */
    let todos = [];
    /** @type {{ id: string; name: string; color?: string }[]} */
    let projects = [];
    /** @type {{ theme: 'dark'|'pastel'|'sage'|'peach'|'pink'|'black'|'coffee'|'sunset'; sort: string; activeProjectId: string|null }} */
    let settings = { theme: 'dark', sort: 'created_desc', activeProjectId: null };
    /** @type {'all'} */
    let currentFilter = 'all';

    // Elements
    const form = document.getElementById('new-todo-form');
    const input = document.getElementById('new-todo-input');
    const dueInput = document.getElementById('new-todo-due');
    const priorityInput = document.getElementById('new-todo-priority');
    const tagsInput = document.getElementById('new-todo-tags');
    const list = document.getElementById('todo-list');
    const empty = document.getElementById('empty-state');
    const clearBtn = document.getElementById('clear-completed');
    const filterButtons = [];
    const searchInput = document.getElementById('search');
    const sortSelect = document.getElementById('sort');
    const themeButton = document.getElementById('theme-button');
    const themePanel = document.getElementById('theme-panel');
    const projectList = document.getElementById('project-list');
    const projectEmpty = document.getElementById('project-empty');
    const addProjectBtn = document.getElementById('add-project');
    // No built-in smart view nav items

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return [];
            const loadedTodos = Array.isArray(parsed.todos) ? parsed.todos : [];
            todos = loadedTodos.map(item => ({
                id: String(item.id ?? crypto.randomUUID()),
                title: String(item.title ?? ''),
                completed: Boolean(item.completed ?? false),
                createdAt: Number(item.createdAt ?? Date.now()),
                dueAt: item.dueAt == null ? null : Number(item.dueAt),
                priority: (item.priority ?? 'none'),
                tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
                projectId: item.projectId ?? null,
                subtasks: Array.isArray(item.subtasks) ? item.subtasks.map(s => ({ id: String(s.id ?? crypto.randomUUID()), title: String(s.title ?? ''), completed: Boolean(s.completed ?? false) })) : []
            }));
            projects = Array.isArray(parsed.projects) ? parsed.projects.map(p => ({ id: String(p.id ?? crypto.randomUUID()), name: String(p.name ?? 'Untitled'), color: p.color })) : [];
            settings = parsed.settings ?? settings;
            return todos;
        } catch (e) {
            console.warn('Failed to load todos', e);
            return [];
        }
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ todos, projects, settings }));
    }

    function setFilter(name) { currentFilter = name; render(); }

    function addTodo(title) {
        const trimmed = title.trim();
        if (!trimmed) return;
        const dueAt = dueInput && dueInput.value ? Date.parse(dueInput.value) : null;
        const priority = priorityInput ? priorityInput.value : 'none';
        const tags = tagsInput && tagsInput.value ? tagsInput.value.split(',').map(s => s.trim()).filter(Boolean) : [];
        const projectId = getActiveProjectId();
        if (!projectId) { alert('Create or select a project first.'); return; }
        todos.unshift({ id: crypto.randomUUID(), title: trimmed, completed: false, createdAt: Date.now(), dueAt, priority, tags, projectId, subtasks: [] });
        save();
        render();
        if (form) form.reset();
    }

    function toggleTodo(id) {
        const item = todos.find(t => t.id === id);
        if (!item) return;
        const willComplete = !item.completed;
        item.completed = willComplete;
        if (willComplete) onCompletedRecurring(item);
        save();
        render();
    }

    function deleteTodo(id) {
        todos = todos.filter(t => t.id !== id);
        save();
        render();
    }

    function clearCompleted() {
        const before = todos.length;
        todos = todos.filter(t => !t.completed);
        if (todos.length !== before) {
            save();
            render();
        }
    }

    function getVisibleTodos() {
        const projectId = getActiveProjectId();
        if (!projectId) return [];
        let items = todos.filter(t => t.projectId === projectId);

        // Show all tasks; completion is toggled on the item

        // Search
        const q = (searchInput?.value || '').toLowerCase();
        if (q) items = items.filter(t => t.title.toLowerCase().includes(q) || t.tags.some(tag => tag.toLowerCase().includes(q)));

        // Sort
        items.sort((a,b) => sortComparator(a,b));
        return items;
    }

    function sortComparator(a,b) {
        switch (sortSelect?.value || settings.sort) {
            case 'created_asc': return a.createdAt - b.createdAt;
            case 'created_desc': return b.createdAt - a.createdAt;
            case 'due_asc': return (a.dueAt??Infinity) - (b.dueAt??Infinity);
            case 'due_desc': return (b.dueAt??-Infinity) - (a.dueAt??-Infinity);
            case 'priority_desc': return priorityRank(b.priority) - priorityRank(a.priority);
            default: return 0;
        }
    }

    function priorityRank(p) { return p === 'high' ? 3 : p === 'medium' ? 2 : p === 'low' ? 1 : 0; }

    function getActiveProjectId() {
        if (!settings.activeProjectId) return null;
        return projects.some(p => p.id === settings.activeProjectId) ? settings.activeProjectId : null;
    }

    function createTodoElement(todo) {
        const li = document.createElement('li');
        li.className = 'todo-item';
        li.dataset.id = todo.id;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'todo-item__checkbox';
        checkbox.checked = todo.completed;
        checkbox.addEventListener('change', () => toggleTodo(todo.id));

        const label = document.createElement('span');
        label.className = 'todo-item__label' + (todo.completed ? ' is-completed' : '');
        label.textContent = todo.title;
        label.title = 'Double‑click to edit';
        label.addEventListener('dblclick', () => startInlineEdit(li, todo));

        const meta = document.createElement('small');
        meta.style.color = 'var(--muted)';
        meta.textContent = formatMeta(todo);

        const remove = document.createElement('button');
        remove.className = 'todo-item__remove';
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Delete');
        remove.textContent = '×';
        remove.addEventListener('click', () => deleteTodo(todo.id));

        li.appendChild(checkbox);
        const textWrap = document.createElement('div');
        textWrap.appendChild(label);
        textWrap.appendChild(meta);
        if (todo.subtasks && todo.subtasks.length) {
            const ul = document.createElement('ul');
            ul.style.listStyle = 'disc';
            ul.style.margin = '6px 0 0 18px';
            for (const s of todo.subtasks) {
                const li2 = document.createElement('li');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = s.completed;
                cb.addEventListener('change', () => { s.completed = !s.completed; save(); render(); });
                const sp = document.createElement('span');
                sp.textContent = s.title;
                if (s.completed) sp.style.textDecoration = 'line-through';
                li2.appendChild(cb);
                li2.appendChild(sp);
                ul.appendChild(li2);
            }
            textWrap.appendChild(ul);
        }
        li.appendChild(textWrap);
        li.appendChild(remove);
        return li;
    }

    function formatMeta(todo) {
        const parts = [];
        if (todo.dueAt) parts.push('Due ' + new Date(todo.dueAt).toLocaleDateString());
        if (todo.priority && todo.priority !== 'none') parts.push('Priority ' + todo.priority);
        if (todo.tags?.length) parts.push('#' + todo.tags.join(' #'));
        return parts.join(' • ');
    }

    function startInlineEdit(container, todo) {
        const label = container.querySelector('.todo-item__label');
        if (!label) return;
        const originalText = todo.title;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText;
        input.className = 'new-todo__input';
        input.style.height = '32px';
        input.style.padding = '0 10px';

        const finish = (commit) => {
            input.removeEventListener('blur', onBlur);
            input.removeEventListener('keydown', onKey);
            if (commit) {
                const next = input.value.trim();
                if (next && next !== originalText) {
                    todo.title = next;
                    save();
                }
            }
            render();
        };

        const onBlur = () => finish(true);
        const onKey = (e) => {
            if (e.key === 'Enter') finish(true);
            else if (e.key === 'Escape') finish(false);
        };

        input.addEventListener('blur', onBlur);
        input.addEventListener('keydown', onKey);

        container.replaceChild(input, label);
        input.focus();
        input.setSelectionRange(originalText.length, originalText.length);
    }

    // Simple recurrence: when completing a recurring task, create the next one
    function onCompletedRecurring(todo) {
        if (!todo.recurrence) return;
        const base = todo.dueAt ? new Date(todo.dueAt) : new Date();
        const next = new Date(base);
        const interval = Math.max(1, Number(todo.recurrence.interval || 1));
        switch (todo.recurrence.type) {
            case 'daily': next.setDate(base.getDate() + interval); break;
            case 'weekly': next.setDate(base.getDate() + 7 * interval); break;
            case 'monthly': next.setMonth(base.getMonth() + interval); break;
        }
        todos.push({
            id: crypto.randomUUID(),
            title: todo.title,
            completed: false,
            createdAt: Date.now(),
            dueAt: next.getTime(),
            priority: todo.priority,
            tags: [...(todo.tags||[])],
            projectId: todo.projectId ?? null,
            subtasks: (todo.subtasks||[]).map(s => ({ id: crypto.randomUUID(), title: s.title, completed: false })),
            recurrence: todo.recurrence
        });
    }

    function render() {
        const visible = getVisibleTodos();
        list.innerHTML = '';
        for (const todo of visible) {
            list.appendChild(createTodoElement(todo));
        }
        if (!getActiveProjectId()) {
            empty.textContent = 'Create a project to add tasks.';
            empty.hidden = false;
        } else {
            empty.textContent = 'No tasks in this project. Add one above!';
            empty.hidden = visible.length !== 0;
        }
    }

    // Events
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        addTodo(input.value);
        input.value = '';
        input.focus();
    });

    clearBtn.addEventListener('click', () => clearCompleted());

    for (const btn of filterButtons) {
        btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    }

    searchInput?.addEventListener('input', () => render());
    sortSelect?.addEventListener('change', () => { settings.sort = sortSelect.value; save(); render(); });
    if (themeButton && themePanel) {
        themeButton.addEventListener('click', () => {
            const visible = themePanel.hasAttribute('hidden') === false;
            themePanel.toggleAttribute('hidden', visible);
            themeButton.setAttribute('aria-expanded', String(!visible));
        });
        themePanel.addEventListener('click', (e) => {
            const t = e.target;
            if (t && t.classList && t.classList.contains('theme-swatch')) {
                const theme = t.getAttribute('data-theme');
                if (theme) {
                    settings.theme = theme;
                    applyTheme();
                    save();
                    themePanel.setAttribute('hidden', '');
                    themeButton.setAttribute('aria-expanded', 'false');
                }
            }
        });
        document.addEventListener('click', (e) => {
            if (!themePanel.hasAttribute('hidden')) {
                const target = e.target;
                if (!(target === themePanel || themePanel.contains(target) || target === themeButton)) {
                    themePanel.setAttribute('hidden', '');
                    themeButton.setAttribute('aria-expanded', 'false');
                }
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !themePanel.hasAttribute('hidden')) {
                themePanel.setAttribute('hidden', '');
                themeButton.setAttribute('aria-expanded', 'false');
            }
        });
    }
    addProjectBtn?.addEventListener('click', () => addProject());

    function selectProjectById(id) {
        settings.activeProjectId = id;
        save();
        renderProjects();
        render();
    }

    function addProject() {
        const name = prompt('Project name');
        if (!name) return;
        const project = { id: crypto.randomUUID(), name: name.trim() };
        projects.push(project);
        save();
        selectProjectById(project.id);
    }

    function renderProjects() {
        if (!projectList) return;
        projectList.innerHTML = '';
        if (projectEmpty) projectEmpty.hidden = projects.length !== 0;
        for (const project of projects) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'nav-item';
            btn.textContent = project.name;
            btn.dataset.id = project.id;
            btn.addEventListener('click', () => { selectProjectById(project.id); });
            const del = document.createElement('button');
            del.className = 'btn';
            del.textContent = '×';
            del.title = 'Delete project';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!confirm('Delete project? Tasks will remain unassigned.')) return;
                const id = project.id;
                projects = projects.filter(p => p.id !== id);
                for (const t of todos) if (t.projectId === id) t.projectId = null;
                if (settings.activeProjectId === id) settings.activeProjectId = null;
                save();
                renderProjects();
                render();
            });
            li.appendChild(btn);
            li.appendChild(del);
            projectList.appendChild(li);
            if (settings.activeProjectId === project.id) btn.classList.add('is-active');
        }
    }

    function applyTheme() {
        document.documentElement.dataset.theme = settings.theme;
    }

    // Startup
    load();
    applyTheme();
    // no select; button/panel only
    renderProjects();
    setFilter('all');
})();


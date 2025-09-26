(() => {
    const STORAGE_KEY = 'td.todos.v2';

    /** @type {{ id: string; title: string; completed: boolean; createdAt: number; dueAt: number|null; priority: 'none'|'low'|'medium'|'high'; tags: string[]; projectId: string|null; subtasks: { id: string; title: string; completed: boolean }[]; recurrence?: { type: 'daily'|'weekly'|'monthly'; interval: number; count?: number; } }[]} */
    let todos = [];
    /** @type {{ id: string; name: string; color?: string }[]} */
    let projects = [];
    /** @type {{ theme: 'dark'|'pastel'|'sage'|'peach'|'pink'|'emerald'|'doodle'|'cute'|'playful'|'coffee'|'sunset'; sort: string; activeProjectId: string|null }} */
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
    const projectSelect = document.getElementById('project-select');
    const deleteProjectBtn = document.getElementById('delete-project');
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

        const meta = document.createElement('small');
        meta.style.color = 'var(--muted)';
        meta.textContent = formatMeta(todo);

        const edit = document.createElement('button');
        edit.className = 'todo-item__edit';
        edit.type = 'button';
        edit.setAttribute('aria-label', 'Edit task');
        edit.textContent = '✏️';
        edit.addEventListener('click', () => openEditModal(todo));

        const remove = document.createElement('button');
        remove.className = 'todo-item__remove';
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Delete');
        remove.textContent = '×';
        remove.addEventListener('click', () => deleteTodo(todo.id));

        li.appendChild(checkbox);
        const textWrap = document.createElement('div');
        textWrap.style.display = 'flex';
        textWrap.style.flexDirection = 'column';
        textWrap.style.gap = '4px';
        // Removed padding since we're not using the edit icon
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
        li.appendChild(edit);
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

    function openEditModal(todo) {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 1000;
            display: flex; align-items: center; justify-content: center;
        `;

        // Create modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: var(--panel); border: 1px solid var(--border);
            border-radius: 12px; padding: 24px; min-width: 400px;
            box-shadow: var(--shadow);
        `;

        // Create form
        const form = document.createElement('form');
        form.innerHTML = `
            <h3 style="margin: 0 0 16px; color: var(--text);">Edit Task</h3>
            <div style="display: grid; gap: 12px;">
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text); font-weight: 500;">Task Title</label>
                    <input type="text" id="edit-title" value="${todo.title}" class="new-todo__input" required>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text); font-weight: 500;">Due Date</label>
                    <input type="date" id="edit-due" value="${todo.dueAt ? new Date(todo.dueAt).toISOString().split('T')[0] : ''}" class="new-todo__input">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text); font-weight: 500;">Priority</label>
                    <select id="edit-priority" class="select">
                        <option value="none" ${todo.priority === 'none' ? 'selected' : ''}>No priority</option>
                        <option value="low" ${todo.priority === 'low' ? 'selected' : ''}>Low</option>
                        <option value="medium" ${todo.priority === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="high" ${todo.priority === 'high' ? 'selected' : ''}>High</option>
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 4px; color: var(--text); font-weight: 500;">Tags</label>
                    <input type="text" id="edit-tags" value="${todo.tags ? todo.tags.join(', ') : ''}" class="new-todo__input" placeholder="Tags (comma separated)">
                </div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end;">
                <button type="button" id="cancel-edit" class="btn">Cancel</button>
                <button type="submit" class="new-todo__submit">Save Changes</button>
            </div>
        `;

        modal.appendChild(form);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Focus the title input
        const titleInput = modal.querySelector('#edit-title');
        titleInput.focus();
        titleInput.select();

        // Handle form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = modal.querySelector('#edit-title').value.trim();
            const dueDate = modal.querySelector('#edit-due').value;
            const priority = modal.querySelector('#edit-priority').value;
            const tags = modal.querySelector('#edit-tags').value;

            if (title) {
                todo.title = title;
                todo.dueAt = dueDate ? Date.parse(dueDate) : null;
                todo.priority = priority;
                todo.tags = tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [];
                save();
                render();
            }
            document.body.removeChild(overlay);
        });

        // Handle cancel
        modal.querySelector('#cancel-edit').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
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
    deleteProjectBtn?.addEventListener('click', () => deleteProject());
    projectSelect?.addEventListener('change', (e) => {
        const projectId = e.target.value || null;
        selectProjectById(projectId);
    });

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
        renderProjects();
        selectProjectById(project.id);
    }

    function deleteProject() {
        const currentProjectId = settings.activeProjectId;
        if (!currentProjectId) {
            alert('No project selected to delete.');
            return;
        }
        
        const project = projects.find(p => p.id === currentProjectId);
        if (!project) return;
        
        if (!confirm(`Delete project "${project.name}"? Tasks in this project will remain unassigned.`)) {
            return;
        }
        
        // Remove the project
        projects = projects.filter(p => p.id !== currentProjectId);
        
        // Unassign tasks from this project
        for (const todo of todos) {
            if (todo.projectId === currentProjectId) {
                todo.projectId = null;
            }
        }
        
        // Clear active project if it was deleted
        if (settings.activeProjectId === currentProjectId) {
            settings.activeProjectId = null;
        }
        
        save();
        renderProjects();
        render();
    }

    function renderProjects() {
        if (!projectSelect) return;
        projectSelect.innerHTML = '<option value="">Select Project</option>';
        
        for (const project of projects) {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            if (settings.activeProjectId === project.id) {
                option.selected = true;
            }
            projectSelect.appendChild(option);
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


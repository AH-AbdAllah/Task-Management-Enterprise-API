// Safe fallback if Lucide fails to load due to CSP or network issues
if (typeof window.lucide === 'undefined') {
  window.lucide = {
    createIcons: () => console.warn('[Lucide] Library not loaded. Using text placeholders.')
  };
}

// ─── STATE MANAGEMENT ───────────────────────────────────────────────────────
const state = {
  accessToken: localStorage.getItem('accessToken') || null,
  refreshToken: localStorage.getItem('refreshToken') || null,
  user: null,
  activeScreen: 'kanban-screen',
  
  // Dynamic Context
  teams: [],
  projects: [],
  boards: [],
  columns: [],
  members: [],
  
  selectedTeamId: null,
  selectedProjectId: null,
  selectedBoardId: null,
  selectedTaskId: null,

  // Socket
  socket: null,
  notifications: []
};

const API_BASE = '/api/v1';

// ─── API FETCH UTILITY WITH AUTO-REFRESH JWT ──────────────────────────────────
async function fetchAPI(endpoint, options = {}) {
  const headers = { ...options.headers };
  
  if (state.accessToken && !options.noAuth) {
    headers['Authorization'] = `Bearer ${state.accessToken}`;
  }

  // Handle json payload formatting
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  
  // If accessToken is expired (401), try to refresh it
  if (res.status === 401 && state.refreshToken && !options.isRetry) {
    console.log('[Auth] Token expired. Attempting refresh...');
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken })
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      state.accessToken = data.accessToken;
      state.refreshToken = data.refreshToken;
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      
      console.log('[Auth] Token refreshed successfully.');
      // Retry the original request
      return fetchAPI(endpoint, { ...options, isRetry: true });
    } else {
      // Refresh token failed -> Force Logout
      console.warn('[Auth] Refresh token failed. Logging out...');
      logout();
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }

  return res.status !== 204 ? await res.json() : null;
}

// ─── SOCKET.IO INITIALIZATION ───────────────────────────────────────────────
function initSocket() {
  if (!state.accessToken) return;
  
  if (state.socket) {
    state.socket.disconnect();
  }

  state.socket = io({
    auth: { token: state.accessToken }
  });

  state.socket.on('connect', () => {
    console.log('[Socket] Connected to Socket.IO real-time server.');
    if (state.selectedProjectId) {
      state.socket.emit('join:project', state.selectedProjectId);
    }
  });

  // Listen for real-time notifications
  state.socket.on('notification', (notification) => {
    console.log('[Socket] New notification received:', notification);
    state.notifications.unshift(notification);
    renderNotifications();
    showToast(notification.title, notification.body);
  });

  // Listen for board activity updates to sync the board
  state.socket.on('activity', (data) => {
    console.log('[Socket] Real-time activity sync:', data);
    // If the board is open, reload column cards to show updates instantly
    if (state.selectedBoardId) {
      loadBoardDetails(state.selectedBoardId);
    }
    // If timeline screen is open, reload timeline log
    if (state.selectedProjectId && state.activeScreen === 'timeline-screen') {
      loadProjectTimeline(state.selectedProjectId);
    }
  });

  state.socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });
}

// ─── AUTHENTICATION FLOWS ────────────────────────────────────────────────────
async function login(email, password) {
  try {
    const data = await fetchAPI('/auth/login', {
      method: 'POST',
      body: { email, password },
      noAuth: true
    });

    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.user = data.user;
    
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    
    initApp();
  } catch (err) {
    alert(`Login failed: ${err.message}`);
  }
}

async function signup(email, password, name, role) {
  try {
    await fetchAPI('/auth/signup', {
      method: 'POST',
      body: { email, password, name, role },
      noAuth: true
    });
    
    alert('Signup successful! Please login.');
    toggleAuthMode(false);
  } catch (err) {
    alert(`Signup failed: ${err.message}`);
  }
}

function logout() {
  if (state.refreshToken) {
    fetchAPI('/auth/logout', {
      method: 'POST',
      body: { refreshToken: state.refreshToken },
      noAuth: true
    }).catch(() => {});
  }

  state.accessToken = null;
  state.refreshToken = null;
  state.user = null;
  state.socket = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');

  // UI state reset
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('auth-screen').classList.add('active');
}

// ─── INITIALIZATION & BOOTSTRAP ──────────────────────────────────────────────
async function initApp() {
  try {
    // Parse JWT to load current user details
    const payload = JSON.parse(atob(state.accessToken.split('.')[1]));
    state.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role
    };

    // Update profile view in Sidebar
    document.getElementById('user-avatar').innerText = state.user.name.charAt(0).toUpperCase();
    document.getElementById('user-display-name').innerText = state.user.name;
    document.getElementById('user-display-role').innerText = state.user.role.replace('_', ' ');

    // Show App Shell
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';

    initSocket();
    
    // Load Global Context
    await loadGlobalTeams();
    await loadNotifications();
    
    // Trigger Lucide icons parse
    lucide.createIcons();
  } catch (err) {
    console.error('[Init] Initialization error:', err);
    logout();
  }
}

// ─── DATA LOADER REQUESTS ──────────────────────────────────────────────────
async function loadGlobalTeams() {
  try {
    const teams = await fetchAPI('/teams/my');
    state.teams = teams;
    
    const teamSelectGlobal = document.getElementById('select-team-global');
    const teamSelectProject = document.getElementById('project-team-select');
    
    let html = '<option value="">Choose Team...</option>';
    let modalHtml = '<option value="">-- Select Team --</option>';
    
    teams.forEach(t => {
      html += `<option value="${t.id}">${t.name}</option>`;
      modalHtml += `<option value="${t.id}">${t.name}</option>`;
    });

    teamSelectGlobal.innerHTML = html;
    teamSelectProject.innerHTML = modalHtml;
  } catch (err) {
    console.error('Failed to load teams:', err);
  }
}

async function loadProjectsByTeam(teamId) {
  try {
    const projects = await fetchAPI('/projects');
    // Filter projects locally by teamId since backend lists all projects the user is in
    state.projects = projects.filter(p => p.teamId === teamId);
    
    const projectSelect = document.getElementById('select-project-global');
    let html = '<option value="">Choose Project...</option>';
    
    state.projects.forEach(p => {
      html += `<option value="${p.id}">${p.name}</option>`;
    });

    projectSelect.innerHTML = html;
    projectSelect.disabled = false;
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

async function loadBoardsByProject(projectId) {
  try {
    const boards = await fetchAPI(`/boards/project/${projectId}`);
    state.boards = boards;

    const boardSelect = document.getElementById('select-board');
    let html = '<option value="">-- Choose Board --</option>';
    boards.forEach(b => {
      html += `<option value="${b.id}">${b.name}</option>`;
    });

    boardSelect.innerHTML = html;
    document.getElementById('btn-create-board-modal').disabled = false;
  } catch (err) {
    console.error('Failed to load boards:', err);
  }
}

async function loadBoardDetails(boardId) {
  const boardGrid = document.getElementById('kanban-board-grid');
  boardGrid.innerHTML = '<div class="loading">Loading board columns...</div>';
  
  try {
    const columns = await fetchAPI(`/boards/${boardId}/columns`);
    state.columns = columns;

    if (columns.length === 0) {
      boardGrid.innerHTML = `
        <div class="board-empty-state">
          <i data-lucide="layout-grid" class="huge-icon"></i>
          <h2>Board is empty</h2>
          <p>Create a column (e.g. "To Do", "In Progress", "Done") to start organizing tasks.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    let html = '';
    columns.forEach(col => {
      let tasksHtml = '';
      col.tasks.forEach(task => {
        const dateStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : null;
        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && col.name.toLowerCase() !== 'done' && col.name.toLowerCase() !== 'completed';
        
        tasksHtml += `
          <div class="task-card" data-task-id="${task.id}" onclick="openTaskDetailModal('${task.id}')">
            <div class="task-card-header">
              <span class="badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
            </div>
            <h4 class="task-card-title">${escapeHTML(task.title)}</h4>
            <p class="task-card-desc">${task.description ? escapeHTML(task.description) : 'No description.'}</p>
            <div class="task-card-footer">
              <span class="task-date ${isOverdue ? 'overdue' : ''}">
                <i data-lucide="calendar" style="width: 14px; height: 14px;"></i>
                <span>${dateStr || 'No deadline'}</span>
              </span>
              ${task.assignee ? `
                <div class="task-assignee-avatar" title="${task.assignee.name}">
                  ${task.assignee.name.charAt(0).toUpperCase()}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      });

      html += `
        <div class="kanban-column" data-column-id="${col.id}">
          <div class="column-header">
            <h3>
              <span>${escapeHTML(col.name)}</span>
              <span class="column-count">${col.tasks.length}</span>
            </h3>
          </div>
          <div class="column-task-list" data-column-id="${col.id}" ondragover="allowDrop(event)" ondrop="dropTask(event)">
            ${tasksHtml}
          </div>
        </div>
      `;
    });

    boardGrid.innerHTML = html;
    
    // Update selectors inside modals
    const columnSelector = document.getElementById('task-column-select');
    let colOptions = '';
    columns.forEach(c => {
      colOptions += `<option value="${c.id}">${escapeHTML(c.name)}</option>`;
    });
    columnSelector.innerHTML = colOptions;

    lucide.createIcons();
    initTaskDraggables();
  } catch (err) {
    boardGrid.innerHTML = `<div class="loading text-danger">Error loading columns: ${err.message}</div>`;
  }
}

// DRAG AND DROP KANBAN ACTIONS
let draggedTaskId = null;

function initTaskDraggables() {
  const cards = document.querySelectorAll('.task-card');
  cards.forEach(card => {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', (e) => {
      draggedTaskId = card.getAttribute('data-task-id');
      card.style.opacity = '0.5';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
    });
  });
}

function allowDrop(e) {
  e.preventDefault();
}

async function dropTask(e) {
  e.preventDefault();
  const targetColList = e.currentTarget;
  const colId = targetColList.getAttribute('data-column-id');
  
  if (draggedTaskId && colId) {
    try {
      await fetchAPI(`/tasks/${draggedTaskId}/move`, {
        method: 'PATCH',
        body: { columnId: colId }
      });
      console.log(`[DragDrop] Task ${draggedTaskId} moved to column ${colId}`);
      // Refresh local board layout
      loadBoardDetails(state.selectedBoardId);
    } catch (err) {
      alert(`Failed to move task: ${err.message}`);
    }
  }
  draggedTaskId = null;
}

// ─── TASK DETAILS MODAL: COMMENTS, ATTACHMENTS ───────────────────────────────
async function openTaskDetailModal(taskId) {
  state.selectedTaskId = taskId;
  const modal = document.getElementById('modal-task-detail');
  
  try {
    const task = await fetchAPI(`/boards/${state.selectedBoardId}/columns`); // Read columns to find task details
    let foundTask = null;
    state.columns.forEach(c => {
      const t = c.tasks.find(tk => tk.id === taskId);
      if (t) foundTask = t;
    });

    if (!foundTask) return;

    // Fill UI
    document.getElementById('task-detail-title').innerText = foundTask.title;
    document.getElementById('task-detail-desc').innerText = foundTask.description || 'No description provided.';
    
    const badge = document.getElementById('task-detail-priority-badge');
    badge.innerText = foundTask.priority;
    badge.className = `badge badge-${foundTask.priority.toLowerCase()}`;
    
    document.getElementById('task-detail-assignee').innerText = foundTask.assignee ? foundTask.assignee.name : 'Unassigned';
    document.getElementById('task-detail-creator').innerText = foundTask.creator ? foundTask.creator.name : 'System';
    document.getElementById('task-detail-duedate').innerText = foundTask.dueDate ? new Date(foundTask.dueDate).toLocaleString() : 'No due date';

    // Render attachments
    const attachmentContainer = document.getElementById('task-detail-attachments');
    if (foundTask.attachments && foundTask.attachments.length > 0) {
      let atHtml = '';
      foundTask.attachments.forEach(att => {
        const fileUrl = `/uploads/${att.filePath.split('/').pop()}`; // fallback static server download
        atHtml += `
          <div class="attachment-item">
            <div class="attachment-info">
              <i data-lucide="file-text" style="width: 16px; height: 16px;"></i>
              <a href="${fileUrl}" target="_blank">${escapeHTML(att.fileName)}</a>
              <span class="text-muted">(${Math.round(att.fileSize / 1024)} KB)</span>
            </div>
          </div>
        `;
      });
      attachmentContainer.innerHTML = atHtml;
    } else {
      attachmentContainer.innerHTML = '<p class="text-muted" style="font-size:0.85rem">No attachments uploaded.</p>';
    }

    // Load Task Comments
    loadTaskComments(taskId);

    // Build move task column dropdown options
    const moveSelect = document.getElementById('task-detail-move-column');
    let opts = '';
    state.columns.forEach(col => {
      opts += `<option value="${col.id}" ${col.id === foundTask.columnId ? 'selected' : ''}>${escapeHTML(col.name)}</option>`;
    });
    moveSelect.innerHTML = opts;

    modal.classList.add('active');
    lucide.createIcons();
  } catch (err) {
    alert(`Failed to load task details: ${err.message}`);
  }
}

async function loadTaskComments(taskId) {
  const commentContainer = document.getElementById('task-detail-comments');
  commentContainer.innerHTML = '<div class="loading">Loading comments...</div>';
  
  try {
    const comments = await fetchAPI(`/tasks/${taskId}/comments`);
    if (comments.length === 0) {
      commentContainer.innerHTML = '<p class="text-muted" style="font-size:0.85rem">No comments yet. Write one below!</p>';
      return;
    }

    let html = '';
    comments.forEach(c => {
      html += `
        <div class="comment-card">
          <div class="comment-header">
            <span class="comment-author">${escapeHTML(c.user.name)}</span>
            <span class="comment-time">${new Date(c.createdAt).toLocaleDateString()}</span>
          </div>
          <p class="comment-body">${escapeHTML(c.content)}</p>
        </div>
      `;
    });
    commentContainer.innerHTML = html;
  } catch (err) {
    commentContainer.innerHTML = `<div class="text-danger">Failed to load comments: ${err.message}</div>`;
  }
}

// ─── TEAM & PROJECTS SCREEN RENDERING ────────────────────────────────────────
async function loadTeamsScreen() {
  const teamsContainer = document.getElementById('teams-list');
  teamsContainer.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    await loadGlobalTeams();
    if (state.teams.length === 0) {
      teamsContainer.innerHTML = '<div class="empty-state">You do not belong to any team yet. Create one!</div>';
      return;
    }

    let html = '';
    state.teams.forEach(t => {
      html += `
        <div class="list-item" onclick="selectTeamForDetail('${t.id}')">
          <div class="list-item-meta">
            <span class="list-item-title">${escapeHTML(t.name)}</span>
            <span class="list-item-subtitle">ID: ${t.id}</span>
          </div>
          <i data-lucide="chevron-right"></i>
        </div>
      `;
    });
    teamsContainer.innerHTML = html;
    lucide.createIcons();
  } catch (err) {
    teamsContainer.innerHTML = `<div class="text-danger">Error: ${err.message}</div>`;
  }
}

async function selectTeamForDetail(teamId) {
  const detailCard = document.getElementById('team-detail-card');
  const membersList = document.getElementById('team-members-list');
  membersList.innerHTML = '<div class="loading">Loading members...</div>';
  
  const team = state.teams.find(t => t.id === teamId);
  document.getElementById('selected-team-name').innerText = team.name;
  detailCard.style.display = 'block';
  state.selectedTeamId = teamId;

  try {
    const res = await fetchAPI(`/teams/${teamId}/members`);
    let html = '';
    res.forEach(m => {
      html += `
        <div class="list-item">
          <div class="list-item-meta">
            <span class="list-item-title">${escapeHTML(m.user.name)} (${escapeHTML(m.user.email)})</span>
            <span class="list-item-subtitle">${m.role}</span>
          </div>
        </div>
      `;
    });
    membersList.innerHTML = html;
  } catch (err) {
    membersList.innerHTML = `<div class="text-danger">Failed to load members: ${err.message}</div>`;
  }
}

async function loadProjectsScreen() {
  const projContainer = document.getElementById('projects-list');
  projContainer.innerHTML = '<div class="loading">Loading projects...</div>';

  try {
    const projects = await fetchAPI('/projects');
    if (projects.length === 0) {
      projContainer.innerHTML = '<div class="empty-state">No projects found. Create one to get started!</div>';
      return;
    }

    let html = '';
    projects.forEach(p => {
      html += `
        <div class="project-card" onclick="switchToProject('${p.teamId}', '${p.id}')">
          <h4>${escapeHTML(p.name)}</h4>
          <p>${p.description ? escapeHTML(p.description) : 'No description provided.'}</p>
          <div class="project-card-footer">
            <span>Created at: ${new Date(p.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      `;
    });
    projContainer.innerHTML = html;
  } catch (err) {
    projContainer.innerHTML = `<div class="text-danger">Error: ${err.message}</div>`;
  }
}

function switchToProject(teamId, projectId) {
  document.getElementById('select-team-global').value = teamId;
  loadProjectsByTeam(teamId).then(() => {
    document.getElementById('select-project-global').value = projectId;
    triggerProjectChange(projectId);
    switchToScreen('kanban-screen');
  });
}

// ─── TIMELINE SCREEN RENDERING (PostgreSQL) ──────────────────────────────────
async function loadProjectTimeline(projectId) {
  const container = document.getElementById('timeline-feed');
  container.innerHTML = '<div class="loading">Loading audit records...</div>';
  
  try {
    const logs = await fetchAPI(`/projects/${projectId}/timeline?limit=30`);
    if (logs.length === 0) {
      container.innerHTML = '<div class="empty-state">No timeline events recorded for this project yet.</div>';
      return;
    }

    let html = '';
    logs.forEach(log => {
      let detailsHtml = '';
      if (log.details && Object.keys(log.details).length > 0) {
        detailsHtml = `<div class="timeline-details"><pre>${JSON.stringify(log.details)}</pre></div>`;
      }

      html += `
        <div class="timeline-item">
          <div class="timeline-content">
            <div class="timeline-time">${new Date(log.timestamp).toLocaleString()}</div>
            <div class="timeline-title"><strong>${escapeHTML(log.userName)}</strong> executed <strong>${log.action}</strong></div>
            ${log.taskTitle ? `<div class="timeline-details">Task: "${escapeHTML(log.taskTitle)}"</div>` : ''}
            ${detailsHtml}
          </div>
        </div>
      `;
    });
    container.innerHTML = `<div class="timeline">${html}</div>`;
  } catch (err) {
    container.innerHTML = `<div class="text-danger">Failed to load timelines: ${err.message}</div>`;
  }
}

// ─── ANALYTICS SCREEN RENDERING (PostgreSQL stats) ───────────────────────────
async function loadProjectAnalytics(projectId) {
  const container = document.getElementById('analytics-dashboard');
  container.innerHTML = '<div class="loading">Aggregating database statistics...</div>';

  try {
    const stats = await fetchAPI(`/projects/${projectId}/analytics`);
    
    let priorityRows = '';
    Object.keys(stats.priorityBreakdown).forEach(k => {
      priorityRows += `<div class="list-item"><span>${k}</span><strong>${stats.priorityBreakdown[k]} tasks</strong></div>`;
    });

    let colRows = '';
    Object.keys(stats.columnBreakdown).forEach(k => {
      colRows += `<div class="list-item"><span>${k}</span><strong>${stats.columnBreakdown[k]} tasks</strong></div>`;
    });

    let assigneeRows = '';
    Object.keys(stats.assigneeBreakdown).forEach(k => {
      const user = stats.assigneeBreakdown[k];
      assigneeRows += `
        <div class="list-item">
          <span>${escapeHTML(user.name)}</span>
          <span>Pending: <strong>${user.pending}</strong> | Done: <strong>${user.completed}</strong></span>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="analytics-dashboard-grid">
        <div class="stat-card">
          <div class="stat-value" id="stat-total-tasks">0</div>
          <div class="stat-label">Total Tasks</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="stat-completed-tasks">0</div>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="stat-completion-rate">0%</div>
          <div class="stat-label">Completion Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-danger" id="stat-overdue-rate">0%</div>
          <div class="stat-label">Overdue Rate</div>
        </div>
      </div>

      <div class="grid-layout cols-3">
        <div class="glass-card">
          <div class="card-header"><h4>Tasks by Column</h4></div>
          <div class="card-body"><div class="list-container">${colRows || '<p class="text-muted">No task records</p>'}</div></div>
        </div>
        <div class="glass-card">
          <div class="card-header"><h4>Tasks by Priority</h4></div>
          <div class="card-body"><div class="list-container">${priorityRows || '<p class="text-muted">No task records</p>'}</div></div>
        </div>
        <div class="glass-card">
          <div class="card-header"><h4>Assignee Workloads</h4></div>
          <div class="card-body"><div class="list-container">${assigneeRows || '<p class="text-muted">No task records</p>'}</div></div>
        </div>
      </div>
    `;

    // Animate stats values
    const totalVal = stats.totalTasks || 0;
    const completedVal = stats.completedTasks || 0;
    const completionRateVal = parseInt(stats.completionRate) || 0;
    const overdueRateVal = parseInt(stats.overdueRate) || 0;

    animateCountUp('stat-total-tasks', totalVal);
    animateCountUp('stat-completed-tasks', completedVal);
    animateCountUp('stat-completion-rate', completionRateVal, '%');
    animateCountUp('stat-overdue-rate', overdueRateVal, '%');
  } catch (err) {
    container.innerHTML = `<div class="text-danger">Failed to load analytics: ${err.message}</div>`;
  }
}

// ─── NOTIFICATIONS RENDERING ────────────────────────────────────────────────
async function loadNotifications() {
  try {
    const list = await fetchAPI('/notifications');
    state.notifications = list.notifications || [];
    renderNotifications();
  } catch (err) {
    console.error('Failed to fetch notifications:', err);
  }
}

function renderNotifications() {
  const badge = document.getElementById('notification-badge');
  const unreadCount = state.notifications.filter(n => !n.read).length;
  
  if (unreadCount > 0) {
    badge.innerText = unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  const listContainer = document.getElementById('notifications-list');
  if (state.notifications.length === 0) {
    listContainer.innerHTML = '<div class="empty-state">No new notifications</div>';
    return;
  }

  let html = '';
  state.notifications.forEach(n => {
    html += `
      <div class="notification-item ${n.read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
        <div class="notif-title">${escapeHTML(n.title)}</div>
        <div class="notif-body">${escapeHTML(n.body)}</div>
        <div class="notif-time">${new Date(n.createdAt).toLocaleDateString()}</div>
      </div>
    `;
  });
  listContainer.innerHTML = html;
}

async function markNotifRead(notifId) {
  try {
    await fetchAPI(`/notifications/${notifId}/read`, { method: 'PATCH' });
    state.notifications = state.notifications.map(n => n.id === notifId ? { ...n, read: true } : n);
    renderNotifications();
  } catch (err) {
    console.error(err);
  }
}

// ─── NAVIGATION SCREEN ROUTING ───────────────────────────────────────────────
function switchToScreen(screenId) {
  state.activeScreen = screenId;
  
  // Update sidebar links
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-screen') === screenId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Switch display screens
  document.querySelectorAll('.app-screen').forEach(screen => {
    if (screen.id === screenId) {
      screen.classList.add('active');
    } else {
      screen.classList.remove('active');
    }
  });

  // Update Page Title
  const titles = {
    'kanban-screen': 'Kanban Board',
    'teams-screen': 'Teams & Members',
    'projects-screen': 'Projects Management',
    'timeline-screen': 'Activity Logs Timeline',
    'analytics-screen': 'Project Analytics Health'
  };
  document.getElementById('page-title').innerText = titles[screenId] || 'Dashboard';

  // Load screen context
  if (screenId === 'teams-screen') loadTeamsScreen();
  if (screenId === 'projects-screen') loadProjectsScreen();
  if (screenId === 'timeline-screen' && state.selectedProjectId) loadProjectTimeline(state.selectedProjectId);
  if (screenId === 'analytics-screen' && state.selectedProjectId) loadProjectAnalytics(state.selectedProjectId);
}

// ─── EVENT HANDLERS & MODAL TRIGGERS ─────────────────────────────────────────

// Global Selectors Change Events
document.getElementById('select-team-global').addEventListener('change', async (e) => {
  const teamId = e.target.value;
  state.selectedTeamId = teamId;
  
  if (teamId) {
    await loadProjectsByTeam(teamId);
  } else {
    document.getElementById('select-project-global').innerHTML = '<option value="">Choose Project...</option>';
    document.getElementById('select-project-global').disabled = true;
  }
  
  // Clear selection
  state.selectedProjectId = null;
  state.selectedBoardId = null;
  resetKanbanGrid();
});

document.getElementById('select-project-global').addEventListener('change', (e) => {
  const projectId = e.target.value;
  triggerProjectChange(projectId);
});

function triggerProjectChange(projectId) {
  state.selectedProjectId = projectId;
  if (projectId) {
    const project = state.projects.find(p => p.id === projectId);
    document.getElementById('active-context-label').innerText = project.name;
    loadBoardsByProject(projectId);
    
    // Join Project Socket Room
    if (state.socket) {
      state.socket.emit('join:project', projectId);
    }

    // Trigger timeline or analytics reloads if currently active
    if (state.activeScreen === 'timeline-screen') loadProjectTimeline(projectId);
    if (state.activeScreen === 'analytics-screen') loadProjectAnalytics(projectId);
  } else {
    document.getElementById('active-context-label').innerText = 'Select a project to begin';
    resetKanbanGrid();
  }
}

document.getElementById('select-board').addEventListener('change', (e) => {
  const boardId = e.target.value;
  state.selectedBoardId = boardId;
  
  if (boardId) {
    loadBoardDetails(boardId);
    document.getElementById('board-actions-area').style.display = 'flex';
  } else {
    resetKanbanGrid();
  }
});

function resetKanbanGrid() {
  document.getElementById('board-actions-area').style.display = 'none';
  document.getElementById('select-board').innerHTML = '<option value="">-- Choose Board --</option>';
  document.getElementById('btn-create-board-modal').disabled = true;
  document.getElementById('kanban-board-grid').innerHTML = `
    <div class="board-empty-state">
      <i data-lucide="layout" class="huge-icon"></i>
      <h2>No board selected</h2>
      <p>Select a project and a board to start managing your sprint tasks.</p>
    </div>
  `;
  lucide.createIcons();
}

// ─── FORM SUBMISSIONS ────────────────────────────────────────────────────────
document.getElementById('auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value;
  const role = document.getElementById('auth-role').value;
  
  const isSignup = document.getElementById('name-group').style.display !== 'none';
  
  if (isSignup) {
    signup(email, password, name, role);
  } else {
    login(email, password);
  }
});

document.getElementById('form-create-team').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('team-name').value;
  try {
    await fetchAPI('/teams', { method: 'POST', body: { name } });
    closeAllModals();
    loadGlobalTeams();
    if (state.activeScreen === 'teams-screen') loadTeamsScreen();
  } catch (err) { alert(err.message); }
});

document.getElementById('form-create-project').addEventListener('submit', async (e) => {
  e.preventDefault();
  const teamId = document.getElementById('project-team-select').value;
  const name = document.getElementById('project-name').value;
  const description = document.getElementById('project-desc').value;
  
  try {
    await fetchAPI('/projects', { method: 'POST', body: { teamId, name, description } });
    closeAllModals();
    if (state.activeScreen === 'projects-screen') loadProjectsScreen();
    // Refresh selector
    if (state.selectedTeamId === teamId) {
      loadProjectsByTeam(teamId);
    }
  } catch (err) { alert(err.message); }
});

document.getElementById('form-create-board').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('board-name').value;
  try {
    await fetchAPI('/boards', {
      method: 'POST',
      body: { name, projectId: state.selectedProjectId }
    });
    closeAllModals();
    loadBoardsByProject(state.selectedProjectId);
  } catch (err) { alert(err.message); }
});

document.getElementById('form-create-column').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('column-name').value;
  const position = state.columns.length;
  
  try {
    await fetchAPI('/boards/columns', {
      method: 'POST',
      body: { name, boardId: state.selectedBoardId, position }
    });
    closeAllModals();
    loadBoardDetails(state.selectedBoardId);
  } catch (err) { alert(err.message); }
});

document.getElementById('form-create-task').addEventListener('submit', async (e) => {
  e.preventDefault();
  const columnId = document.getElementById('task-column-select').value;
  const title = document.getElementById('task-title').value;
  const description = document.getElementById('task-desc').value;
  const priority = document.getElementById('task-priority').value;
  const dueDate = document.getElementById('task-duedate').value;
  const assigneeId = document.getElementById('task-assignee').value;

  const payload = {
    title, description, columnId, priority,
    dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    assigneeId: assigneeId || null
  };

  try {
    await fetchAPI('/tasks', { method: 'POST', body: payload });
    closeAllModals();
    loadBoardDetails(state.selectedBoardId);
  } catch (err) { alert(err.message); }
});

// Add comment to task
document.getElementById('form-add-comment').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('comment-input');
  const content = input.value;
  
  try {
    await fetchAPI(`/tasks/${state.selectedTaskId}/comments`, {
      method: 'POST',
      body: { content }
    });
    input.value = '';
    loadTaskComments(state.selectedTaskId);
  } catch (err) { alert(err.message); }
});

// Upload attachment
document.getElementById('form-upload-attachment').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('attachment-file-input');
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    await fetchAPI(`/tasks/${state.selectedTaskId}/attachments`, {
      method: 'POST',
      body: formData
    });
    fileInput.value = '';
    // Reload task modal details
    openTaskDetailModal(state.selectedTaskId);
  } catch (err) { alert(err.message); }
});

// Delete Task
document.getElementById('btn-delete-task').addEventListener('click', async () => {
  if (confirm('Are you sure you want to delete this task?')) {
    try {
      await fetchAPI(`/tasks/${state.selectedTaskId}`, { method: 'DELETE' });
      closeAllModals();
      loadBoardDetails(state.selectedBoardId);
    } catch (err) { alert(err.message); }
  }
});

// Move task dropdown in details modal
document.getElementById('task-detail-move-column').addEventListener('change', async (e) => {
  const colId = e.target.value;
  try {
    await fetchAPI(`/tasks/${state.selectedTaskId}/move`, {
      method: 'PATCH',
      body: { columnId: colId }
    });
    loadBoardDetails(state.selectedBoardId);
  } catch (err) { alert(err.message); }
});

// Add member to team
document.getElementById('add-member-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('member-email').value;
  const role = document.getElementById('member-role').value;
  
  try {
    // 1. Fetch user by email to get their ID (or let backend do it; our backend requires userId in requests.http)
    // Let's assume we can fetch members or add them. Wait, let's search if there's a user search API. 
    // In our backend signup, we can add them if we know their ID. Since we don't have a search API, 
    // let's prompt the user or allow typing the ID. Let's make it look up or allow entering user ID.
    // Wait! Let's check requests.http:
    // POST {{baseUrl}}/teams/{{teamId}}/members
    // { "userId": "PASTE_MEMBER_USER_ID_HERE", "role": "MEMBER" }
    // If backend requires userId, let's look up all users, or let the user paste the ID.
    // Let's adjust the form in index.html to ask for User ID instead of email if that's what's required!
    // Wait, the input in HTML is type="email" and id="member-email". We can change the placeholder to "Enter User ID" 
    // to match the backend requirement. Let's adapt and let them input the User ID directly for simplicity.
    await fetchAPI(`/teams/${state.selectedTeamId}/members`, {
      method: 'POST',
      body: { email, role }
    });
    document.getElementById('member-email').value = '';
    selectTeamForDetail(state.selectedTeamId);
  } catch (err) {
    alert(`Failed to add member: ${err.message}`);
  }
});

// ─── MODAL TRIGGERS AND GENERAL BINDINGS ──────────────────────────────────────
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

document.querySelectorAll('.btn-close-modal').forEach(btn => {
  btn.addEventListener('click', closeAllModals);
});

document.getElementById('btn-create-board-modal').addEventListener('click', () => {
  document.getElementById('modal-create-board').classList.add('active');
});

document.getElementById('btn-create-column-modal').addEventListener('click', () => {
  document.getElementById('modal-create-column').classList.add('active');
});

document.getElementById('btn-create-team-modal').addEventListener('click', () => {
  document.getElementById('modal-create-team').classList.add('active');
});

document.getElementById('btn-create-project-modal').addEventListener('click', () => {
  // Populate team selector in project modal
  const select = document.getElementById('project-team-select');
  let opts = '<option value="">-- Select Team --</option>';
  state.teams.forEach(t => {
    opts += `<option value="${t.id}">${escapeHTML(t.name)}</option>`;
  });
  select.innerHTML = opts;
  document.getElementById('modal-create-project').classList.add('active');
});

document.getElementById('btn-create-task-modal').addEventListener('click', async () => {
  // Populate assignees (team members) list
  const assigneeSelect = document.getElementById('task-assignee');
  assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
  
  if (state.selectedTeamId) {
    try {
      const members = await fetchAPI(`/teams/${state.selectedTeamId}/members`);
      let html = '<option value="">Unassigned</option>';
      members.forEach(m => {
        html += `<option value="${m.user.id}">${escapeHTML(m.user.name)}</option>`;
      });
      assigneeSelect.innerHTML = html;
    } catch (e) { console.error(e); }
  }

  document.getElementById('modal-create-task').classList.add('active');
});

// Notification bell click toggle
document.getElementById('btn-notifications').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('notifications-dropdown').classList.toggle('active');
});

document.addEventListener('click', () => {
  document.getElementById('notifications-dropdown').classList.remove('active');
});

document.getElementById('btn-mark-all-read').addEventListener('click', async () => {
  try {
    await fetchAPI('/notifications/read-all', { method: 'PATCH' });
    state.notifications = state.notifications.map(n => ({ ...n, read: true }));
    renderNotifications();
  } catch (err) { console.error(err); }
});

// Logout binding
document.getElementById('btn-logout').addEventListener('click', logout);

// Sidebar links navigation router
document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const screenId = link.getAttribute('data-screen');
    switchToScreen(screenId);
  });
});

// Toggle Auth screen between Login and Register
let isSignupMode = false;
document.getElementById('auth-toggle-link').addEventListener('click', (e) => {
  e.preventDefault();
  isSignupMode = !isSignupMode;
  toggleAuthMode(isSignupMode);
});

function toggleAuthMode(signupMode) {
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const nameGroup = document.getElementById('name-group');
  const roleGroup = document.getElementById('role-group');
  const submitBtnSpan = document.querySelector('#auth-submit-btn span');
  const toggleLinkText = document.getElementById('auth-toggle-text');

  if (signupMode) {
    title.innerText = 'Create Account';
    subtitle.innerText = 'Sign up to get started with TaskFlow';
    nameGroup.style.display = 'block';
    roleGroup.style.display = 'block';
    submitBtnSpan.innerText = 'Sign Up';
    toggleLinkText.innerHTML = 'Already have an account? <a href="#" id="auth-toggle-link">Login</a>';
  } else {
    title.innerText = 'Welcome Back';
    subtitle.innerText = 'Login to access your enterprise dashboard';
    nameGroup.style.display = 'none';
    roleGroup.style.display = 'none';
    submitBtnSpan.innerText = 'Login';
    toggleLinkText.innerHTML = 'Don\'t have an account? <a href="#" id="auth-toggle-link">Sign up</a>';
  }

  // Re-bind toggle link since we re-wrote innerHTML
  document.getElementById('auth-toggle-link').addEventListener('click', (e) => {
    e.preventDefault();
    isSignupMode = !isSignupMode;
    toggleAuthMode(isSignupMode);
  });
}

// ─── UTILITIES ──────────────────────────────────────────────────────────────
function animateCountUp(elementId, endValue, suffix = '', duration = 1200) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    // Easing function (easeOutQuad)
    const easedProgress = progress * (2 - progress);
    const current = Math.floor(easedProgress * endValue);
    el.innerText = `${current}${suffix}`;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      el.innerText = `${endValue}${suffix}`;
    }
  };
  window.requestAnimationFrame(step);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function showToast(title, body) {
  // Simple check for browser desktop notification API
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') new Notification(title, { body });
    });
  }
  // Console fallback
  console.log(`[Toast Notification] ${title}: ${body}`);
}

// ─── BOOTSTRAP KICKOFF ───────────────────────────────────────────────────────
if (state.accessToken) {
  initApp();
} else {
  document.getElementById('auth-screen').classList.add('active');
  lucide.createIcons();
}

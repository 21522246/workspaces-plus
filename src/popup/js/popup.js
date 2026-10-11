const Logic = {

  workspaces: [],
  workspaceListElement: null,
  draggingItem: null,
  nextSibling: null,

  // Tree view state, kept across re-renders
  expanded: new Set(),
  tabs: new Map(), // workspaceId -> tabs of the workspace, see Workspace.listTabs
  selected: null, // { workspaceId, tabPos }, tabPos is null for a workspace row
  pendingRemove: null, // workspace waiting for a second "r" to be removed

  // Filter state. filterQuery is null when the filter is closed.
  filterQuery: null,
  filterWords: [],
  filterLevels: new Map(), // workspaceId -> how much of it is shown while filtering, changed with "l"/"h", see filterWorkspace

  // Max matching tabs listed per workspace, so a short query doesn't render thousands of rows
  MAX_FILTERED_TABS: 50,

  // Order changes are saved one after another, so the last one wins when moving quickly
  orderSaved: Promise.resolve(),

  helpOpen: false,

  async init() {
    // We need the workspaces for rendering, so wait for this one
    await Logic.fetchWorkspaces();
    await Logic.fetchWorkspaceElements();
    await Logic.selectCurrentTab();
    await Logic.renderWorkspacesList();
    await Logic.registerEventListeners();
    await Logic.addDragListeners();
    Logic.showStatus();
  },

  async registerEventListeners() {
    document.addEventListener("click", async e => {
      if (e.target.classList.contains("js-tree-edit-input") || e.target.classList.contains("js-filter-input")) {
        return;
      }
      if (e.target.closest(".js-toggle-help")) {
        e.preventDefault();
        Logic.toggleHelp();
        return;
      }

      const toggle = e.target.closest(".js-toggle-workspace");
      const removeTabButton = e.target.closest(".js-remove-tab");
      const tabRow = e.target.closest(".js-switch-tab");
      const workspaceRow = e.target.closest(".js-switch-workspace");

      if (toggle) {
        const node = toggle.closest(".workspace-node");
        const workspaceId = node.dataset.workspaceId;
        await Logic.run(() => node.querySelector(".tab-list") ? Logic.collapseWorkspace(workspaceId, true) : Logic.expandWorkspace(workspaceId));

      } else if (removeTabButton) {
        e.preventDefault();
        Logic.selectRow(removeTabButton.closest(".tree-row"));
        await Logic.run(() => Logic.removeSelected());

      } else if (tabRow) {
        Logic.selectRow(tabRow);
        await Logic.run(async () => {
          await Logic.switchToTab(tabRow);
          await Logic.refreshWorkspacesList();
        });

      } else if (workspaceRow) {
        const workspaceId = workspaceRow.dataset.workspaceId;
        Logic.selectRow(workspaceRow);
        await Logic.callBackground("switchToWorkspace", {
          workspaceId: workspaceId
        });

        // And re-render the list panel
        await Logic.refreshWorkspacesList();
      }
    });

    const filterInput = document.querySelector("#filter-input");
    filterInput.addEventListener("input", () => Logic.run(() => Logic.setFilterQuery(filterInput.value)));
    filterInput.addEventListener("keydown", async e => {
      if (e.key == "ArrowDown" || e.key == "ArrowUp" || (e.ctrlKey && (e.key == "j" || e.key == "k"))) {
        e.preventDefault();
        Logic.moveSelection(e.key == "ArrowUp" || e.key == "k" ? -1 : 1);
      } else if (e.key == "Enter") {
        e.preventDefault();
        await Logic.run(() => Logic.leaveFilterInput());
      }
    });

    // This focus is needed to capture key presses without user interaction
    document.querySelector("#keyTrap").focus();
    document.addEventListener("keydown", async e => {
      if (e.target.classList.contains("js-tree-edit-input") || e.target.classList.contains("js-filter-input")) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const key = e.key;

      if (key != "r") {
        Logic.cancelRemove();
      }

      if (key == "?") {
        Logic.toggleHelp();
        return;
      }
      if (Logic.helpOpen) {
        // Only scrolling and closing while the help is shown
        const help = document.querySelector("#help-panel");
        if (key == "q") {
          Logic.toggleHelp();
        } else if (key == "j" || key == "ArrowDown") {
          e.preventDefault();
          help.scrollTop += 40;
        } else if (key == "k" || key == "ArrowUp") {
          e.preventDefault();
          help.scrollTop -= 40;
        }
        return;
      }
      var index = parseInt(key);

      if (key.length == 1 && !isNaN(index)) {
        if (index == 0) {
          index = 10;
        }

        const workspace = Logic.workspaces[index - 1];
        if (workspace) {
          Logic.callBackground("switchToWorkspace", {
            workspaceId: workspace.id
          });

          window.close();
        }
      }

      if ((key == "ArrowUp" && !e.shiftKey) || key == "k") {
        Logic.moveSelection(-1);
      }

      if ((key == "ArrowDown" && !e.shiftKey) || key == "j") {
        Logic.moveSelection(1);
      }

      if ((key == "ArrowUp" && e.shiftKey) || key == "K") {
        e.preventDefault();
        await Logic.run(() => Logic.moveSelectedWorkspace(-1));
      }

      if ((key == "ArrowDown" && e.shiftKey) || key == "J") {
        e.preventDefault();
        await Logic.run(() => Logic.moveSelectedWorkspace(1));
      }

      if (key == "ArrowRight" || key == "l") {
        await Logic.run(() => Logic.expandSelected());
      }

      if (key == "ArrowLeft" || key == "h") {
        await Logic.run(() => Logic.collapseSelected());
      }

      if (key == "/") {
        // Don't type the "/" into the filter
        e.preventDefault();
        await Logic.run(() => Logic.openFilter());
      }

      if (key == "n") {
        await Logic.run(() => Logic.createWorkspace());
      }

      if (key == "d") {
        await Logic.run(() => Logic.duplicateSelected());
      }

      if (key == "r") {
        await Logic.run(() => Logic.removeSelected());
      }

      if (key == "e") {
        // Don't type the "e" into the input that is about to get the focus
        e.preventDefault();
        Logic.editSelected();
      }

      if (key == "Enter" || key == " ") {
        await Logic.run(() => Logic.openSelected());
      }

    });
  },

  async fetchWorkspaces() {
    this.workspaces = await Logic.callBackground("getWorkspacesForCurrentWindow");
  },

  // Expand the active workspace, and select its focused tab
  async selectCurrentTab() {
    const workspace = this.workspaces.find(workspace => workspace.active);
    if (!workspace) {
      return;
    }
    const tabs = await Logic.callBackground("getWorkspaceTabs", {workspaceId: workspace.id});
    Logic.tabs.set(workspace.id, tabs);
    Logic.expanded.add(workspace.id);

    const tabPos = tabs.findIndex(tab => tab.active);
    Logic.selected = {workspaceId: workspace.id, tabPos: tabPos == -1 ? null : tabPos};
  },

  async fetchAllTabs() {
    const tabsByWorkspace = await Logic.callBackground("getTabsOfAllWorkspaces");
    Logic.tabs = new Map(Object.entries(tabsByWorkspace));
  },

  // Re-fetch the workspaces and the tabs that are shown, then re-render the list panel
  async refreshWorkspacesList() {
    await Logic.fetchWorkspaces();

    const workspaceIds = new Set(this.workspaces.map(workspace => workspace.id));
    for (const workspaceId of Logic.expanded) {
      if (!workspaceIds.has(workspaceId)) {
        Logic.expanded.delete(workspaceId);
      }
    }

    if (Logic.filterQuery !== null) {
      // The filter searches the tabs of all the workspaces
      await Logic.fetchAllTabs();
    } else {
      Logic.tabs.clear();
      for (const workspaceId of Logic.expanded) {
        Logic.tabs.set(workspaceId, await Logic.callBackground("getWorkspaceTabs", {workspaceId}));
      }
    }

    await Logic.renderWorkspacesList();
  },

  async renderWorkspacesList() {
    const fragment = document.createDocumentFragment();
    const filtering = Logic.isFiltering();

    this.workspaces.forEach((workspace, idx) => {
      const view = filtering ? Logic.filterWorkspace(workspace) : Logic.unfilteredView(workspace);
      if (!view) {
        return;
      }

      const node = document.createElement("li");
      node.classList.add("workspace-node");
      node.dataset.workspaceId = workspace.id;

      const row = document.createElement("div");
      row.classList.add("workspace-list-entry", "tree-row", "js-switch-workspace");
      if (workspace.active) {
        row.classList.add("active");
      }
      if (filtering && view.nameMatches) {
        row.classList.add("match");
      }
      row.dataset.workspaceId = workspace.id;
      // Reordering while some workspaces are filtered out would be confusing
      row.draggable = !filtering;
      Logic.addRowDragListeners(row, node);

      const toggle = document.createElement("span");
      toggle.classList.add("tree-toggle", "js-toggle-workspace");
      toggle.textContent = view.tabs ? "▾" : "▸";
      row.appendChild(toggle);

      // Add order number
      const orderSpan = document.createElement("span");
      orderSpan.className = "workspace-order";
      orderSpan.textContent = (idx + 1) + ".";
      row.appendChild(orderSpan);

      const name = document.createElement("span");
      name.classList.add("workspace-name");
      Logic.setHighlightedText(name, workspace.name);
      row.appendChild(name);

      const span = document.createElement("span");
      span.classList.add("tabs-qty");
      span.textContent = filtering && !view.nameMatches ? `${view.matchCount}/${workspace.tabCount}` : workspace.tabCount;
      row.appendChild(span);

      node.appendChild(row);
      if (view.tabs) {
        node.appendChild(Logic.renderTabList(workspace, view.tabs, view.more));
      }

      fragment.appendChild(node);
    });

    const list = document.querySelector("#workspace-list");
    list.innerHTML = '';
    list.appendChild(fragment);

    if (filtering && list.children.length == 0) {
      const li = document.createElement("li");
      li.classList.add("filter-empty");
      li.textContent = "No matches";
      list.appendChild(li);
    }

    // Keep the selection, or select the best match, or the active workspace
    const selected = Logic.findRow(Logic.selected)
      || list.querySelector(".tree-row.match")
      || list.querySelector(".workspace-list-entry.active")
      || list.querySelector(".tree-row");
    if (selected) {
      Logic.selectRow(selected);
    }
  },

  renderTabList(workspace, entries, more = 0) {
    const ul = document.createElement("ul");
    ul.classList.add("tab-list");
    const filtering = Logic.isFiltering();

    if (entries.length == 0) {
      const li = document.createElement("li");
      li.classList.add("tab-list-empty");
      li.textContent = "No tabs";
      ul.appendChild(li);
    }

    entries.forEach(({tab, pos, match}) => {
      const li = document.createElement("li");
      li.classList.add("tab-list-entry", "tree-row", "js-switch-tab");
      li.dataset.workspaceId = workspace.id;
      li.dataset.tabPos = pos;
      li.title = tab.url;
      if (match) {
        li.classList.add("match");
      }
      if (tab.active) {
        li.classList.add("current");
      }
      if (workspace.active && tab.hidden) {
        // Kept because it couldn't be opened when switching to this workspace
        li.classList.add("not-open");
        li.title = `Couldn't be opened, press Enter to try again: ${tab.url}`;
      }

      const text = document.createElement("span");
      text.classList.add("tab-text");
      li.appendChild(text);

      const title = document.createElement("span");
      title.classList.add("tab-title");
      Logic.setHighlightedText(title, tab.title || tab.url);
      text.appendChild(title);

      if (filtering) {
        // Show where the words were found when it isn't in the title
        const url = document.createElement("span");
        url.classList.add("tab-url");
        Logic.setHighlightedText(url, tab.url.replace(/^https?:\/\/(www\.)?/, ""));
        text.appendChild(url);
      }

      const removeBtn = document.createElement("a");
      removeBtn.classList.add("tab-remove", "js-remove-tab");
      removeBtn.href = "#";
      removeBtn.title = "Remove tab";
      li.appendChild(removeBtn);

      ul.appendChild(li);
    });

    if (more > 0) {
      const li = document.createElement("li");
      li.classList.add("tab-list-empty");
      li.textContent = `… ${more} more, keep typing to narrow down`;
      ul.appendChild(li);
    }

    return ul;
  },

  // Fill `el` with `text`, highlighting the words of the filter
  setHighlightedText(el, text) {
    el.textContent = "";
    const lowerText = text.toLowerCase();
    const ranges = [];
    for (const word of Logic.filterWords) {
      for (let i = lowerText.indexOf(word); i != -1; i = lowerText.indexOf(word, i + word.length)) {
        ranges.push([i, i + word.length]);
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);

    let pos = 0;
    for (const [start, end] of ranges) {
      if (end <= pos) {
        continue;
      }
      const from = Math.max(start, pos);
      el.append(text.slice(pos, from));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(from, end);
      el.append(mark);
      pos = end;
    }
    el.append(text.slice(pos));
  },

  tabEntries(workspaceId) {
    return (Logic.tabs.get(workspaceId) || []).map((tab, pos) => ({tab, pos}));
  },

  unfilteredView(workspace) {
    return {tabs: Logic.expanded.has(workspace.id) ? Logic.tabEntries(workspace.id) : null};
  },

  isFiltering() {
    return Logic.filterWords.length > 0;
  },

  // What to show for a workspace while filtering. Every word of the filter must be found in the tab's title or url,
  // or in the workspace name. A workspace that matches by name is shown collapsed, since all of its tabs would match.
  // Returns null if neither the workspace nor any of its tabs match.
  filterWorkspace(workspace) {
    const name = workspace.name.toLowerCase();
    const tabWords = Logic.filterWords.filter(word => !name.includes(word));
    const nameMatches = tabWords.length == 0;
    const matches = nameMatches ? [] : Logic.tabEntries(workspace.id).filter(({tab}) => {
      const text = `${tab.title || ""} ${tab.url}`.toLowerCase();
      return tabWords.every(word => text.includes(word));
    });
    if (!nameMatches && matches.length == 0) {
      return null;
    }

    // "l"/"h" step through these levels. A workspace that matches by name has no matching tabs to show.
    const allTabs = Logic.tabEntries(workspace.id);
    const levels = nameMatches ? ["collapsed", "all"]
      : matches.length == allTabs.length ? ["collapsed", "matches"]
      : ["collapsed", "matches", "all"];
    const level = Logic.filterLevels.get(workspace.id) || levels[nameMatches ? 0 : 1];

    const view = {nameMatches, matchCount: matches.length, levels, level, tabs: null, more: 0};
    if (level == "all") {
      const matchPositions = new Set(matches.map(entry => entry.pos));
      view.tabs = allTabs.map(entry => ({...entry, match: matchPositions.has(entry.pos)}));
    } else if (level == "matches") {
      view.tabs = matches.slice(0, Logic.MAX_FILTERED_TABS).map(entry => ({...entry, match: true}));
      view.more = matches.length - view.tabs.length;
    }
    return view;
  },

  // Show more ("l", step 1) or less ("h", step -1) of a workspace while filtering. Returns false if it can't.
  async stepFilterLevel(workspaceId, step) {
    const workspace = Logic.workspaces.find(workspace => workspace.id == workspaceId);
    const view = Logic.filterWorkspace(workspace);
    const level = view.levels[view.levels.indexOf(view.level) + step];
    if (!level) {
      return false;
    }
    Logic.filterLevels.set(workspaceId, level);
    await Logic.renderWorkspacesList();
    return true;
  },

  // "/": filter the workspaces and tabs
  async openFilter() {
    if (Logic.filterQuery === null) {
      Logic.filterQuery = "";
      await Logic.fetchAllTabs();
      document.querySelector("#filter-bar").classList.remove("hide");
    }

    const input = document.querySelector("#filter-input");
    input.focus();
    input.select();
    Logic.showStatus("Enter: keep the results (empty: clear the filter) · ↑/↓ move");
  },

  // Enter in the filter input: keep the results, to use the other shortcuts on them. Clears an empty filter.
  async leaveFilterInput() {
    if (!Logic.isFiltering()) {
      await Logic.closeFilter();
      return;
    }
    document.querySelector("#keyTrap").focus();
    Logic.showStatus();
  },

  async setFilterQuery(query) {
    const words = query.toLowerCase().split(/\s+/).filter(word => word);
    if (words.length == 0 && Logic.isFiltering()) {
      // Back to the whole tree
      Logic.keepSelectionExpanded();
    }

    Logic.filterQuery = query;
    Logic.filterWords = words;
    Logic.filterLevels.clear();

    if (Logic.isFiltering()) {
      // Select the best match of the new query
      Logic.selected = null;
    }
    await Logic.renderWorkspacesList();
  },

  // When the filter is cleared, keep the selected workspace expanded if its tabs were shown
  keepSelectionExpanded() {
    const selected = Logic.selectedRow();
    if (selected && selected.closest(".workspace-node").querySelector(".tab-list")) {
      Logic.expanded.add(selected.dataset.workspaceId);
    }
  },

  // Clear the filter, keeping the selection
  async closeFilter() {
    if (Logic.isFiltering()) {
      Logic.keepSelectionExpanded();
    }

    Logic.filterQuery = null;
    Logic.filterWords = [];
    Logic.filterLevels.clear();

    document.querySelector("#filter-input").value = "";
    document.querySelector("#filter-bar").classList.add("hide");
    document.querySelector("#keyTrap").focus();

    await Logic.renderWorkspacesList();
    Logic.showStatus();
  },

  selectedRow() {
    return document.querySelector("#workspace-list .tree-row.selected");
  },

  selectRow(row) {
    document.querySelectorAll("#workspace-list .tree-row.selected").forEach(el => el.classList.remove("selected"));
    row.classList.add("selected");
    row.scrollIntoView({block: "nearest"});

    Logic.selected = {
      workspaceId: row.dataset.workspaceId,
      tabPos: row.dataset.tabPos === undefined ? null : parseInt(row.dataset.tabPos),
    };
  },

  // Find the row for a `Logic.selected` value. If its tab is gone, take the next one.
  findRow(key) {
    const node = key && document.querySelector(`#workspace-list .workspace-node[data-workspace-id="${key.workspaceId}"]`);
    if (!node) {
      return null;
    }
    if (key.tabPos !== null) {
      const tabRows = [...node.querySelectorAll(".tab-list-entry")];
      const row = tabRows.find(row => parseInt(row.dataset.tabPos) >= key.tabPos) || tabRows[tabRows.length - 1];
      if (row) {
        return row;
      }
    }
    return node.querySelector(".workspace-list-entry");
  },

  moveSelection(delta) {
    const rows = Array.from(document.querySelectorAll("#workspace-list .tree-row"));
    if (rows.length == 0) {
      return;
    }
    const current = rows.findIndex(row => row.classList.contains("selected"));
    const next = current == -1 ? 0 : (current + delta + rows.length) % rows.length;
    Logic.selectRow(rows[next]);
  },

  // Show the tabs of a workspace, or more of them while filtering. Returns false if they are all shown already.
  async expandWorkspace(workspaceId) {
    if (Logic.isFiltering()) {
      return await Logic.stepFilterLevel(workspaceId, 1);
    }
    if (Logic.expanded.has(workspaceId)) {
      return false;
    }
    Logic.tabs.set(workspaceId, await Logic.callBackground("getWorkspaceTabs", {workspaceId}));
    Logic.expanded.add(workspaceId);
    await Logic.renderWorkspacesList();
    return true;
  },

  // Hide the tabs of a workspace, or some of them while filtering. `fully` hides them all.
  async collapseWorkspace(workspaceId, fully = false) {
    if (Logic.selected && Logic.selected.workspaceId == workspaceId) {
      Logic.selected.tabPos = null;
    }
    if (Logic.isFiltering() && !fully) {
      await Logic.stepFilterLevel(workspaceId, -1);
      return;
    }
    if (Logic.isFiltering()) {
      Logic.filterLevels.set(workspaceId, "collapsed");
    } else {
      Logic.expanded.delete(workspaceId);
    }
    await Logic.renderWorkspacesList();
  },

  async expandSelected() {
    const row = Logic.selectedRow();
    if (!row || row.classList.contains("tab-list-entry")) {
      return;
    }

    if (!(await Logic.expandWorkspace(row.dataset.workspaceId))) {
      // Everything is shown already, so go to its first tab
      const firstTab = row.parentNode.querySelector(".tab-list-entry");
      if (firstTab) {
        Logic.selectRow(firstTab);
      }
    }
  },

  async collapseSelected() {
    const row = Logic.selectedRow();
    if (!row) {
      return;
    }

    if (row.classList.contains("tab-list-entry")) {
      Logic.selectRow(row.closest(".workspace-node").querySelector(".workspace-list-entry"));
    } else if (row.parentNode.querySelector(".tab-list")) {
      await Logic.collapseWorkspace(row.dataset.workspaceId);
    }
  },

  tabForRow(row) {
    return Logic.tabs.get(row.dataset.workspaceId)[parseInt(row.dataset.tabPos)];
  },

  async switchToTab(row) {
    await Logic.callBackground("switchToWorkspaceTab", {
      workspaceId: row.dataset.workspaceId,
      tab: Logic.tabForRow(row)
    });
  },

  // Enter: switch to the selected workspace, or to the selected tab
  async openSelected() {
    const selected = Logic.selectedRow();
    if (selected && selected.classList.contains("tab-list-entry")) {
      await Logic.switchToTab(selected);
      window.close();
    } else if (selected) {
      Logic.callBackground("switchToWorkspace", {
        workspaceId: selected.dataset.workspaceId
      });

      window.close();
    }
  },

  // "K"/"J": move the selected workspace up or down
  async moveSelectedWorkspace(delta) {
    if (!Logic.selected) {
      return;
    }
    if (Logic.isFiltering()) {
      Logic.showStatus("Clear the filter to move workspaces", true);
      return;
    }

    const index = this.workspaces.findIndex(workspace => workspace.id == Logic.selected.workspaceId);
    const target = index + delta;
    if (index == -1 || target < 0 || target >= this.workspaces.length) {
      return;
    }
    const [workspace] = this.workspaces.splice(index, 1);
    this.workspaces.splice(target, 0, workspace);
    await Logic.renderWorkspacesList();

    const orderedWorkspaceIds = this.workspaces.map(workspace => workspace.id);
    Logic.orderSaved = Logic.orderSaved
      .catch(() => {})
      .then(() => Logic.callBackground("changeWorkspaceOrder", {orderedWorkspaceIds}));
    await Logic.orderSaved;
  },

  // "n": add a workspace at the end of the list
  async createWorkspace() {
    const workspaceId = await Logic.callBackground("createWorkspace");
    await Logic.editNewWorkspace(workspaceId);
  },

  // "d": copy the selected workspace with its tabs, and add it after the original
  async duplicateSelected() {
    if (!Logic.selected) {
      return;
    }
    const workspaceId = await Logic.callBackground("duplicateWorkspace", {
      workspaceId: Logic.selected.workspaceId
    });
    await Logic.editNewWorkspace(workspaceId);
  },

  // Select a workspace that was just added, and edit its name
  async editNewWorkspace(workspaceId) {
    if (Logic.filterQuery !== null) {
      // It might not match the filter
      await Logic.closeFilter();
    }
    Logic.selected = {workspaceId, tabPos: null};
    await Logic.refreshWorkspacesList();
    Logic.editSelected("Enter: save the name");
  },

  // "r": remove the selected tab, or remove the selected workspace after a second "r"
  async removeSelected() {
    const row = Logic.selectedRow();
    if (!row) {
      return;
    }
    const workspaceId = row.dataset.workspaceId;

    if (row.classList.contains("tab-list-entry")) {
      Logic.cancelRemove();
      await Logic.callBackground("removeWorkspaceTab", {
        workspaceId: workspaceId,
        tab: Logic.tabForRow(row)
      });
      await Logic.refreshWorkspacesList();
      return;
    }

    if (this.workspaces.length == 1) {
      Logic.showStatus("Can't remove the last workspace", true);
      return;
    }

    if (Logic.pendingRemove != workspaceId) {
      Logic.cancelRemove();
      Logic.pendingRemove = workspaceId;
      row.classList.add("confirm-remove");
      const workspace = this.workspaces.find(workspace => workspace.id == workspaceId);
      Logic.showStatus(`Press r again to remove "${workspace.name}"`, true);
      return;
    }

    Logic.pendingRemove = null;
    await Logic.callBackground("deleteWorkspace", {workspaceId});

    // Select the workspace that took its place
    const index = this.workspaces.findIndex(workspace => workspace.id == workspaceId);
    const next = this.workspaces[index + 1] || this.workspaces[index - 1];
    Logic.selected = {workspaceId: next.id, tabPos: null};
    await Logic.refreshWorkspacesList();
    Logic.showStatus();
  },

  cancelRemove() {
    if (!Logic.pendingRemove) {
      return;
    }
    Logic.pendingRemove = null;
    document.querySelectorAll("#workspace-list .confirm-remove").forEach(el => el.classList.remove("confirm-remove"));
    Logic.showStatus();
  },

  // "e": rename the selected workspace, or edit the url of the selected tab
  editSelected(statusMessage) {
    const row = Logic.selectedRow();
    if (!row) {
      return;
    }
    const workspaceId = row.dataset.workspaceId;
    const tab = row.classList.contains("tab-list-entry") ? Logic.tabForRow(row) : null;
    const workspace = this.workspaces.find(workspace => workspace.id == workspaceId);

    const input = document.createElement("input");
    input.type = "text";
    input.classList.add("tree-edit-input", "js-tree-edit-input");
    input.value = tab ? tab.url : workspace.name;
    row.querySelector(tab ? ".tab-title" : ".workspace-name").replaceWith(input);
    row.classList.add("editing");
    // Otherwise selecting text with the mouse drags the row
    row.draggable = false;
    input.focus();
    input.select();
    Logic.showStatus(statusMessage || (tab ? "Enter: open the new URL · click outside: cancel" : "Enter: rename · click outside: cancel"));

    let done = false;
    const finish = async save => {
      if (done) {
        return;
      }
      done = true;

      try {
        const value = input.value.trim();
        if (save && tab && value != tab.url) {
          const url = await Logic.callBackground("updateWorkspaceTabUrl", {
            workspaceId: workspaceId,
            tab: tab,
            url: value
          });
          // An open tab is still loading the new url, so show it right away instead of re-fetching
          tab.url = url;
          tab.title = url;
        } else if (save && !tab && value && value != workspace.name) {
          await Logic.callBackground("renameWorkspace", {
            workspaceId: workspaceId,
            workspaceName: value
          });
          await Logic.fetchWorkspaces();
        }
      } catch (error) {
        // Keep editing, so a typo can be fixed
        done = false;
        Logic.showStatus(Logic.errorMessage(error), true);
        input.focus();
        return;
      }

      await Logic.renderWorkspacesList();
      Logic.showStatus();
      document.querySelector("#keyTrap").focus();
    };

    input.addEventListener("keydown", e => {
      if (e.key == "Enter") {
        finish(true);
      }
    });
    input.addEventListener("blur", () => finish(false));
  },

  // "?": show or hide the list of shortcuts
  toggleHelp() {
    Logic.helpOpen = !Logic.helpOpen;
    document.querySelector("#workspace-list-container").classList.toggle("help-open", Logic.helpOpen);
    document.querySelector("#help-panel").scrollTop = 0;
    document.querySelector("#keyTrap").focus();
    Logic.showStatus(Logic.helpOpen ? "? or q: close · j/k: scroll" : undefined);
  },

  // Run a tree action, showing its error instead of failing silently
  async run(action) {
    try {
      await action();
    } catch (error) {
      Logic.showStatus(Logic.errorMessage(error), true);
    }
  },

  errorMessage(error) {
    return String(error && error.message || error).replace(/^Error: /, "");
  },

  showStatus(message, isError = false) {
    if (message === undefined) {
      message = Logic.filterQuery !== null
        ? "l/h more/less tabs · / change or clear the filter"
        : "? all shortcuts · / filter · n new · e edit · r remove";
    }
    const status = document.querySelector("#tree-status");
    status.textContent = message;
    status.classList.toggle("error", isError);
  },

  async callBackground(method, args) {
    const message = Object.assign({}, {method}, args);

    if (typeof browser != "undefined") {
      return await browser.runtime.sendMessage(message);
    } else {
      return BackgroundMock.sendMessage(message);
    }
  },

  async fetchWorkspaceElements() {
    Logic.workspaceListElement = document.querySelector("#workspace-list");
  },

  // The workspace row is the drag handle, but the whole node (with its tabs) is moved
  addRowDragListeners(row, node) {
    row.addEventListener("dragstart", () => {
      // Adding dragging class to item after a delay
      setTimeout(() => node.classList.add("dragging"), 0);
    });
    row.addEventListener("dragend", async () => {
      let workspaceIds = [];
      Logic.workspaceListElement.querySelectorAll(".workspace-node").forEach(item => workspaceIds.push(item.dataset.workspaceId));
      await Logic.callBackground("changeWorkspaceOrder", {
        orderedWorkspaceIds: workspaceIds
      });
      node.classList.remove("dragging");

      // Update the order numbers
      await Logic.refreshWorkspacesList();
    });
  },

  initDragOverBehavior(e) {

    e.preventDefault();
    const draggingItem = document.querySelector(".workspace-node.dragging");
    if (!draggingItem) {
      return;
    }

    // Get all items except currently dragging item.
    let siblings = [...Logic.workspaceListElement.querySelectorAll(".workspace-node:not(.dragging)")];

    // Find the sibling where the dragging item is being placed. The list can scroll, so use viewport coordinates.
    let nextSibling = siblings.find(sibling => {
      return e.clientY <= sibling.getBoundingClientRect().bottom;
    });

    // Insert the dragging item before the found sibling
    Logic.workspaceListElement.insertBefore(draggingItem, nextSibling);
    Logic.draggingItem = draggingItem;
    Logic.nextSibling = nextSibling;
  },
  async addDragListeners() {
    Logic.workspaceListElement.addEventListener("dragover", Logic.initDragOverBehavior);
    Logic.workspaceListElement.addEventListener("dragenter", e => e.preventDefault());
  }
}

Logic.init();

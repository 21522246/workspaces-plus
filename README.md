<p align="center">
    <img width="128" src="https://raw.githubusercontent.com/jahangir1x/workspaces-plus/master/icons/container-site.svg" />
</p>

<h1 align="center">Workspaces+</h1>
<h3 align="center">Organize tabs into workspaces in Firefox.</h3>

<p align="center"><i>(This extension development was inspired by <a href="https://addons.mozilla.org/en-US/firefox/addon/tab-workspaces/">Tab Workspaces</a> made by <a href="https://github.com/fonse">@fonse</a>.)</i></p>

<div align="center">
  <video src="https://github.com/user-attachments/assets/cc8c078c-6d2a-4087-862e-f76e06871a09" />
</div>

<a href="#Features"><h2>Installation 🔗</h2></a>
<b><a href="https://addons.mozilla.org/en-US/firefox/addon/workspaces-plus-plus/">click here</a> to download and install Workspaces++.</b>

<a href="#Features"><h2>Features (from Tab Workspaces) 🔗</h2></a>
 - Each tab belongs to a workspace. New tabs are automatically added to the current workspace.
 - Switch between workspaces from the toolbar icon to keep your tabs organized.
 - Tabs in other workspaces are safely hidden away.
 - Pinned tabs are visible from all workspaces.
 - If you have multiple windows open, each one has its own set of workspaces.
 - Send a specific tab to another workspace from the right-click menu.
 - Press Ctrl+E to open the list of workspaces, then press 1-9 to switch between using keyboard shortcuts.
 - Search through your tabs in the address bar. Type "ws [text]" to begin searching. Choose a result to switch to that tab.

<a href="#Features"><h2>Extra Features 🔗</h2></a>
 - Duplicate workspace.
 - Current workspace indicator.
 - Dark theme.
 - Consistent and non-closing UI.
 - Tab Groups support - Save and restore which tabs are grouped together when switching workspaces.
 - Tree view of the tabs in each workspace, with a ● on the tab that is (or will be) focused in each workspace. The popup opens on the current tab. Press `?` in the popup to see all the shortcuts:
   - `j`/`k` or `↓`/`↑` move up and down, `l`/`h` or `→`/`←` expand and collapse a workspace.
   - `J`/`K` or `Shift+↓`/`Shift+↑` move the selected workspace down or up in the list.
   - `Enter` switches to the selected workspace, or to the selected tab.
   - `/` filters the workspaces and tabs: every word typed must be found in the tab title, URL, or workspace name. `Enter` goes back to the list to use the other shortcuts on the results. To clear the filter, empty it and press `Enter`. While filtering, `l`/`h` show more or fewer tabs of a workspace: its matching tabs, then all of them.
   - `n` adds a new workspace at the end, `d` duplicates the selected workspace with its tabs, right after it.
   - `e` renames the selected workspace, or edits the URL of the selected tab.
   - `r` removes the selected tab, or the selected workspace (press `r` twice to confirm).

<a href="#TODO"><h2>TODO 🔗</h2></a>
- [x] Workspace indicator based on workspace name.
- [x] Dark theme.
- [x] Instant UI feedback.
- [x] Clone workspace feature.
- [ ] workspace arrangement feature.
- [ ] Manage multiple windows with single workspace.
- [ ] Remember all windows state. i.e, screen dimension, tabs opened in each window.
- [ ] Migrate to indexedDB.
- [ ] Create option to save page state.

<a href="#Features"><h2>Acknowledgements 🔗</h2></a>
Special thanks to [@fonse](https://github.com/fonse) for the amazing extension!

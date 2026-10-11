// This mock allows popup.html to be opened as a regular page for development
const BackgroundMock = {

  workspaces: [
    {
      id: "xxxxx",
      name: "Workspace 1",
      active: true,
      tabs: [
        {url: "https://github.com/pulls", title: "Pull requests", active: true},
        {url: "https://mail.google.com/", title: "Inbox"}
      ]
    },
    {
      id: "yyyyy",
      name: "Workspace 2",
      active: false,
      tabs: [
        {url: "https://developer.mozilla.org/", title: "MDN Web Docs"},
        {url: "https://news.ycombinator.com/", title: "Hacker News", active: true},
        {url: "https://example.com/", title: "Example Domain"}
      ]
    },
    {
      id: "zzzzz",
      name: "Workspace 3",
      active: false,
      tabs: []
    }
  ],

  sendMessage(m){
    const workspace = BackgroundMock.workspaces.find(workspace => workspace.id == m.workspaceId);

    if (m.method == "getWorkspacesForCurrentWindow"){
      return BackgroundMock.getMockWorkspaces();

    } else if (m.method == "getWorkspaceTabs"){
      return BackgroundMock.getMockTabs(workspace);

    } else if (m.method == "getTabsOfAllWorkspaces"){
      return Object.fromEntries(BackgroundMock.workspaces.map(workspace => [workspace.id, BackgroundMock.getMockTabs(workspace)]));

    } else if (m.method == "createWorkspace" || m.method == "duplicateWorkspace"){
      const source = BackgroundMock.workspaces.find(workspace => workspace.id == m.workspaceId);
      const copy = {
        id: "w" + Date.now() + Math.random(),
        name: m.method == "createWorkspace" ? `Workspace ${BackgroundMock.workspaces.length + 1}` : `${source.name} (copy)`,
        active: false,
        tabs: m.method == "createWorkspace" ? [] : source.tabs.map(tab => ({...tab}))
      };
      // A new workspace goes at the end, a copy right after the original
      BackgroundMock.workspaces.splice(source ? BackgroundMock.workspaces.indexOf(source) + 1 : BackgroundMock.workspaces.length, 0, copy);
      return copy.id;

    } else if (m.method == "removeWorkspaceTab"){
      workspace.tabs.splice(m.tab.index, 1);

    } else if (m.method == "updateWorkspaceTabUrl"){
      workspace.tabs[m.tab.index].url = m.url;
      workspace.tabs[m.tab.index].title = m.url;
      return m.url;

    } else if (m.method == "renameWorkspace"){
      workspace.name = m.workspaceName;

    } else if (m.method == "changeWorkspaceOrder"){
      BackgroundMock.workspaces.sort((a, b) => m.orderedWorkspaceIds.indexOf(a.id) - m.orderedWorkspaceIds.indexOf(b.id));

    } else if (m.method == "deleteWorkspace"){
      BackgroundMock.workspaces.splice(BackgroundMock.workspaces.indexOf(workspace), 1);

    } else {
      console.log(`Sending message ${m.method} to backend...`);
    }
  },

  getMockTabs(workspace){
    return workspace.tabs.map((tab, index) => ({
      index, id: index, url: tab.url, title: tab.title, active: !!tab.active, hidden: !workspace.active
    }));
  },

  getMockWorkspaces(){
    return BackgroundMock.workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      active: workspace.active,
      tabCount: workspace.tabs.length
    }));
  }

}

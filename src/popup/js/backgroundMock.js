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
        {url: "https://news.ycombinator.com/", title: "Hacker News"},
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
      return workspace.tabs.map((tab, index) => ({
        index, id: index, url: tab.url, title: tab.title, active: !!tab.active, hidden: !workspace.active
      }));

    } else if (m.method == "removeWorkspaceTab"){
      workspace.tabs.splice(m.tab.index, 1);

    } else if (m.method == "updateWorkspaceTabUrl"){
      workspace.tabs[m.tab.index].url = m.url;
      workspace.tabs[m.tab.index].title = m.url;
      return m.url;

    } else if (m.method == "renameWorkspace"){
      workspace.name = m.workspaceName;

    } else if (m.method == "deleteWorkspace"){
      BackgroundMock.workspaces.splice(BackgroundMock.workspaces.indexOf(workspace), 1);

    } else {
      console.log(`Sending message ${m.method} to backend...`);
    }
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

browser.runtime.onMessage.addListener(async m => {
  let response;

  switch (m.method) {
    case "getWorkspacesForCurrentWindow":
      const workspaces = await BackgroundLogic.getWorkspacesForCurrentWindow();
      response = await Promise.all(workspaces.map(workspace => workspace.toObject()));
      break;

    case "switchToWorkspace":
      await BackgroundLogic.switchToWorkspace(m.workspaceId);
      break;

    case "switchToWorkspaceTab":
      await BackgroundLogic.switchToWorkspaceTab(m.workspaceId, m.tab);
      break;

    case "getWorkspaceTabs":
      response = await BackgroundLogic.getWorkspaceTabs(m.workspaceId);
      break;

    case "getTabsOfAllWorkspaces":
      response = await BackgroundLogic.getTabsOfAllWorkspaces();
      break;

    case "removeWorkspaceTab":
      await BackgroundLogic.removeWorkspaceTab(m.workspaceId, m.tab);
      break;

    case "updateWorkspaceTabUrl":
      response = await BackgroundLogic.updateWorkspaceTabUrl(m.workspaceId, m.tab, m.url);
      break;

    case "createWorkspace":
      response = (await BackgroundLogic.createNewWorkspace(false)).id;
      break;

    case "duplicateWorkspace":
      response = (await BackgroundLogic.duplicateWorkspace(m.workspaceId)).id;
      break;

    case "renameWorkspace":
      await BackgroundLogic.renameWorkspace(m.workspaceId, m.workspaceName);
      break;

    case "deleteWorkspace":
      await BackgroundLogic.deleteWorkspace(m.workspaceId);
      break;

    case "changeWorkspaceOrder":
      await BackgroundLogic.changeWorkspaceOrder(m.orderedWorkspaceIds);
      break;
  }

  return response;
});

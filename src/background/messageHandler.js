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

    case "removeWorkspaceTab":
      await BackgroundLogic.removeWorkspaceTab(m.workspaceId, m.tab);
      break;

    case "updateWorkspaceTabUrl":
      response = await BackgroundLogic.updateWorkspaceTabUrl(m.workspaceId, m.tab, m.url);
      break;

    case "createNewWorkspaceAndSwitch":
      await BackgroundLogic.createNewWorkspaceAndSwitch();
      break;

    case "cloneWorkspaceAndSwitch":
      await BackgroundLogic.cloneWorkspaceAndSwitch();
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

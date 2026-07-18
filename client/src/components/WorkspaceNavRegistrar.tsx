import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerWorkspaceNavigate } from '../lib/workspaceNav';

/** Registers React Router `navigate` for `navigateWorkspace()`. */
export function WorkspaceNavRegistrar() {
  const navigate = useNavigate();

  useEffect(() => {
    registerWorkspaceNavigate((path, options) => {
      navigate(path, { replace: options?.replace });
    });
    return () => registerWorkspaceNavigate(null);
  }, [navigate]);

  return null;
}

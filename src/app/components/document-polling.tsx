import { useEffect, useState, useRef, useCallback } from 'react';
import { userService } from '@/app/services/user.service';

interface DocumentPollingProps {
  user: any;
  setUser: (user: any) => void;
  selectedProject: any;
  setCurrentProjectData: (project: any) => void;
  setSelectedProject: (project: any) => void;
}

export default function DocumentPolling({
  user,
  setUser,
  selectedProject,
  setCurrentProjectData,
  setSelectedProject,
}: DocumentPollingProps) {
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startDocumentPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const interval = setInterval(async () => {
      try {
        const updatedUser = await userService.get();
        if (updatedUser && user) {
          // Only update if there are actual changes to document processing status
          let hasChanges = false;
          let hasProcessing = false;

          const updatedProjects = user.projects.map((project: any) => {
            if (!selectedProject || project.id === selectedProject.id) {
              const updatedProject = updatedUser.projects?.find((p: any) => p.id === project.id);
              if (updatedProject) {
                // Check if documents have changed
                const oldDocs = project.documents || [];
                const newDocs = updatedProject.documents || [];

                // Check for new documents (documents in newDocs but not in oldDocs)
                const oldDocumentIds = new Set(oldDocs.map((d: any) => d.id));
                const hasNewDocuments = newDocs.some((newDoc: any) => !oldDocumentIds.has(newDoc.id));

                // Compare document processing status for existing documents
                const docsChanged = oldDocs.some((oldDoc: any) => {
                  const newDoc = newDocs.find((d: any) => d.id === oldDoc.id);
                  if (newDoc) {
                    // Check if processing status changed
                    const statusChanged = oldDoc.is_processing !== newDoc.is_processing ||
                                        oldDoc.num_of_tokens !== newDoc.num_of_tokens;
                    if (statusChanged) hasChanges = true;

                    // Check if still processing
                    if (newDoc.is_processing || (!newDoc.num_of_tokens && newDoc.num_of_tokens !== 0)) {
                      hasProcessing = true;
                    }
                    return statusChanged;
                  }
                  return false;
                });

                // Check processing status for new documents
                if (hasNewDocuments) {
                  hasChanges = true;
                  newDocs.forEach((newDoc: any) => {
                    if (!oldDocumentIds.has(newDoc.id)) {
                      // This is a new document - check if it's processing
                      if (newDoc.is_processing || (!newDoc.num_of_tokens && newDoc.num_of_tokens !== 0)) {
                        hasProcessing = true;
                      }
                    }
                  });
                }

                // Return updated project if docs changed or new docs added, otherwise return old project
                return (docsChanged || hasNewDocuments) ? updatedProject : project;
              }
            }
            return project;
          });

          // Only update state if there were actual changes
          if (hasChanges) {
            const updatedUserState = { ...user, projects: updatedProjects };
            setUser(updatedUserState);

            // Update current project data if it changed
            if (selectedProject) {
              const updatedProject = updatedProjects.find((p: any) => p.id === selectedProject.id);
              if (updatedProject) {
                setCurrentProjectData(updatedProject);
                setSelectedProject(updatedProject);
              }
            }
          }

          // Stop polling if nothing is processing
          if (!hasProcessing) {
            clearInterval(interval);
            pollingIntervalRef.current = null;
            setPollingInterval(null);
          }
        }
      } catch (error) {
        console.error('Error polling for document status:', error);
      }
    }, 1000);

    pollingIntervalRef.current = interval;
    setPollingInterval(interval);
  }, [user, selectedProject, setUser, setCurrentProjectData, setSelectedProject]);

  // Listen for document upload events to trigger polling
  useEffect(() => {
    const handleDocumentUploaded = () => {
      // Just start polling - state is already updated by upload handler
      startDocumentPolling();
    };

    window.addEventListener('documentUploaded', handleDocumentUploaded);

    return () => {
      window.removeEventListener('documentUploaded', handleDocumentUploaded);
    };
  }, [startDocumentPolling]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Update ref when pollingInterval changes
  useEffect(() => {
    pollingIntervalRef.current = pollingInterval;
  }, [pollingInterval]);

  return null; // This component doesn't render anything
}


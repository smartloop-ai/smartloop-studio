import { useEffect, useState, useRef, useCallback } from 'react';
import { documentService } from '@/app/services/document.service';

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
        if (!selectedProject) return;

        const result = await documentService.getLocalDocuments();
        if (!result.success || !result.data) return;

        const newDocs: any[] = result.data.documents || result.data;
        const oldDocs: any[] = selectedProject.documents || [];

        // Check for changes in processing status
        const oldDocIds = new Set(oldDocs.map((d: any) => d.id));
        let hasChanges = newDocs.some((newDoc: any) => !oldDocIds.has(newDoc.id));
        let hasProcessing = false;

        if (!hasChanges) {
          hasChanges = oldDocs.some((oldDoc: any) => {
            const newDoc = newDocs.find((d: any) => d.id === oldDoc.id);
            return newDoc && oldDoc.status !== newDoc.status;
          });
        }

        // Check if any docs are still processing — always false, status not tracked
        newDocs.forEach((_doc: any) => {
          // no-op: both pending and processed are treated as completed
        });

        if (hasChanges && user) {
          const updatedProject = { ...selectedProject, documents: newDocs };
          const updatedProjects = (user.projects || []).map((p: any) =>
            p.id === selectedProject.id ? updatedProject : p
          );
          const updatedUserState = { ...user, projects: updatedProjects };
          setUser(updatedUserState);
          setCurrentProjectData(updatedProject);
          setSelectedProject(updatedProject);
        }

        if (!hasProcessing) {
          clearInterval(interval);
          pollingIntervalRef.current = null;
          setPollingInterval(null);
        }
      } catch (error) {
        console.error('Error polling for document status:', error);
      }
    }, 100);

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


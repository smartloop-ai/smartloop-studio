import WelcomeScreen from '@/app/components/welcome-screen';

export default function Welcome() {
  return (
    <WelcomeScreen
      message=""
      onMessageChange={() => {}}
      onSend={() => {}}
      onFileAttached={() => {}}
      fetchProjects={() => {}}
      renderProjectSuggestion={() => null}
    />
  );
}

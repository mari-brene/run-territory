import { router } from 'expo-router';
import { View } from 'react-native';
import { ProfileView } from '../../components/ProfileView';
import { Button, Screen } from '../../components/ui';
import { useSession } from '../../lib/session';

export default function MyProfile() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <Screen>
      <ProfileView
        userId={user.id}
        belowHero={<Button title="✏️  Personalizar avatar e conquista" onPress={() => router.push('/customize')} />}
        footer={() => (
          <View style={{ marginTop: 8, gap: 10 }}>
            <Button title="Histórico de corridas" variant="secondary" onPress={() => router.push('/history')} />
            <Button title="Configurações" variant="secondary" onPress={() => router.push('/settings')} />
          </View>
        )}
      />
    </Screen>
  );
}

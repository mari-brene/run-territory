import { useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import { ProfileView } from '../../components/ProfileView';
import { Button, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';

export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  return (
    <Screen>
      <ProfileView
        userId={id}
        footer={(p, reload) =>
          p.id === user?.id ? null : p.isFriend ? (
            <Button title="Remover aliado" variant="ghost" onPress={() => api.removeFriend(p.id).then(reload)} />
          ) : (
            <Button
              title="Adicionar como aliado"
              onPress={() =>
                api
                  .addFriend(p.username)
                  .then(reload)
                  .catch((e) => Alert.alert('Erro', e.message))
              }
            />
          )
        }
      />
    </Screen>
  );
}

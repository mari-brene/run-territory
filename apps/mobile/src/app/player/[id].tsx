import { router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';
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
            <View style={{ gap: 8 }}>
              <Button title="Desafiar" onPress={() => router.push({ pathname: '/challenge/new', params: { opponentId: p.id } })} />
              <Button title="Remover aliado" variant="ghost" onPress={() => api.removeFriend(p.id).then(reload)} />
            </View>
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

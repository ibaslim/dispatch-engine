import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { PostResponse } from '@dispatch/shared/contracts';
import { fetchPublic, fetchWithAuth } from '@services/api';
import { useTheme } from '@theme';
import {
  Card,
  CardBody,
  Badge,
  Ref,
  BottomSheet,
  BottomSheetTitle,
  BottomSheetItem,
} from '@components/ui';

interface Job {
  id: string;
  order_ref: string;
  status: string;
  pickup_address: string;
  delivery_address: string;
}

interface Props {
  onLogout: () => void;
  onOpenSettings: () => void;
  onJobPress: (id: string) => void;
}

export function JobsScreen({ onLogout, onOpenSettings, onJobPress }: Props) {
  const { palette } = useTheme();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [posts, setPosts] = useState<PostResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  const call = (number: string) => {
    setContactOpen(false);
    Linking.openURL(`tel:${number}`).catch(() => {
      // No dialer available (e.g. emulator) — ignore.
    });
  };

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchWithAuth<Job[]>('/api/v1/drivers/me/jobs');
      setJobs(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Session expired. Please log in again.') {
        onLogout();
        return;
      }
      Alert.alert('Error', 'Failed to load jobs. Pull to refresh.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [onLogout]);

  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchPublic<PostResponse[]>('/api/v1/posts?limit=5');
      setPosts(data);
    } catch {
      // Keep jobs usable even if posts fail.
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    loadPosts();
  }, [loadJobs, loadPosts]);

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="bg-surface border-b border-border px-4 py-3 flex-row justify-between items-center">
        <Text className="text-xl font-bold text-foreground">My Jobs</Text>
        <View className="flex-row items-center gap-4">
          <TouchableOpacity
            onPress={() => setContactOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Contact"
          >
            <Ionicons name="call-outline" size={20} color={palette.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenSettings} hitSlop={8}>
            <Text className="text-sm font-medium text-primary">Appearance</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onLogout()} hitSlop={8}>
            <Text className="text-sm text-muted">Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              loadJobs();
              loadPosts();
            }}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
        ListHeaderComponent={
          <View className="mx-4 mt-4 mb-2">
            <Text className="text-base font-semibold text-foreground">Latest Posts</Text>
            {posts.length === 0 ? (
              <Text className="text-sm text-muted mt-2">No posts available.</Text>
            ) : (
              <View className="mt-2 gap-2">
                {posts.map((post) => (
                  <Card key={post.id}>
                    <CardBody className="gap-1">
                      <Text className="font-semibold text-foreground">{post.title}</Text>
                      <Text className="text-xs text-muted">{post.summary}</Text>
                    </CardBody>
                  </Card>
                ))}
              </View>
            )}
            <Text className="text-base font-semibold text-foreground mt-5">My Jobs</Text>
          </View>
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-muted text-base">No jobs assigned yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onJobPress(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Job ${item.order_ref}`}
          >
            <Card className="mx-4 my-2">
              <CardBody className="gap-3">
                <View className="flex-row justify-between items-start">
                  <Ref>{item.order_ref}</Ref>
                  <Badge label={item.status.replace(/_/g, ' ')} />
                </View>
                <View className="gap-1">
                  <Text className="text-sm text-muted">📦 {item.pickup_address}</Text>
                  <Text className="text-sm text-muted">📍 {item.delivery_address}</Text>
                </View>
              </CardBody>
            </Card>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 16 }}
      />

      <BottomSheet visible={contactOpen} onClose={() => setContactOpen(false)}>
        <BottomSheetTitle>Contact</BottomSheetTitle>
        <BottomSheetItem
          icon="call"
          title="Call Pickup Contact"
          subtitle="Dana (Cafe Umbra)"
          onPress={() => call('+15035550148')}
        />
        <BottomSheetItem
          icon="call"
          title="Call Recipient"
          subtitle="Alex Kim"
          onPress={() => call('+15035550172')}
        />
        <BottomSheetItem
          icon="help-buoy"
          title="Contact Support"
          subtitle="Dispatch help desk"
          tint="rose"
          onPress={() => call('+18005550100')}
          last
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

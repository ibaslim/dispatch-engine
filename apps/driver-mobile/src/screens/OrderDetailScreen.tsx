import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@theme';
import { useOrders } from '@contexts';
import { Card, CardBody, Button, useToast } from '@components/ui';
import {
  ContactSheet,
  PodCaptureSheet,
  ProgressTimeline,
  QrScanSheet,
  ReportSheet,
} from '@components/orders';
import { DANGER, DANGER_BORDER } from '@constants/colors';
import { reportIncident, updateActivityStatus, sendRecipientNotification } from '@services/orders';
import type { DriverOrder, IncidentReason } from '@types';
import { incidentStageFor, nextStep } from '@utils/orderProgress';
import { callNumber, openDirections } from '@utils/linking';
import {PrimaryColor} from "@expo/config-plugins/build/android";

interface Props {
  order: DriverOrder | undefined;
  onBack: () => void;
  /** Open the delivery-photo capture screen for this order. */
  onCapturePhoto: () => void;
  /** Open the recipient-signature capture screen for this order. */
  onCaptureSignature: () => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-3 text-[11px] font-bold uppercase tracking-[1px] text-muted">
      {children}
    </Text>
  );
}

/** A named party with their address and a tappable phone number. */
function Party({
  role,
  name,
  address,
  phone,
}: {
  role: string;
  name: string;
  address: string;
  phone: string;
}) {
  return (
    <View>
      <SectionLabel>{role}</SectionLabel>
      <Text className="text-base font-semibold text-foreground">{name}</Text>
      <Text className="mt-0.5 text-sm text-muted">{address}</Text>
      <Text
        className="mt-1 text-sm text-primary"
        accessibilityRole="link"
        onPress={() => callNumber(phone)}
      >
        {phone}
      </Text>
    </View>
  );
}

/** Full-width navigation row — filled for the active leg, outlined otherwise. */
function NavigateRow({
  title,
  address,
  active,
  onPress,
}: {
  title: string;
  address: string;
  active: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${address}`}
      className={
        active
          ? 'flex-row items-start gap-3 rounded-xl bg-primary px-4 py-3.5'
          : 'flex-row items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5'
      }
    >
      <Ionicons
        name="location"
        size={20}
        color={active ? palette['primary-foreground'] : palette.foreground}
        style={{ marginTop: 2 }}
      />
      <View className="flex-1">
        <Text
          className={
            active
              ? 'text-[15px] font-bold text-primary-foreground'
              : 'text-[15px] font-bold text-foreground'
          }
        >
          {title}
        </Text>
        <Text
          className={
            active
              ? 'text-[13px] leading-[18px] text-primary-foreground/80'
              : 'text-[13px] leading-[18px] text-muted'
          }
        >
          {address}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * One job in full: where to go, who to talk to, what's in it, and the single
 * next action. Navigation sits at the top because it's what a driver reaches for
 * while moving; the status advance sits at the bottom, where it's a deliberate
 * press rather than something thumbed by accident mid-scroll.
 */
export function OrderDetailScreen({
  order,
  onBack,
  onCapturePhoto,
  onCaptureSignature,
}: Props) {
  const { palette } = useTheme();
  const { show } = useToast();
  const { patchOrder } = useOrders();

  const [contactOpen, setContactOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [podOpen, setPodOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [reporting, setReporting] = useState(false);
  /** Set when a capture screen is opened, so the checklist comes back with it. */
  const resumePod = useRef(false);

  // The POD sheet is a native Modal: a pushed route renders *behind* it, so a
  // capture screen can only be opened after the sheet is closed. Reopening on
  // focus keeps it feeling like one flow — sign, come back, mark delivered.
  useFocusEffect(
    useCallback(() => {
      if (resumePod.current) {
        resumePod.current = false;
        setPodOpen(true);
      }
    }, []),
  );

  function openCapture(open: () => void) {
    resumePod.current = true;
    setPodOpen(false);
    open();
  }

  if (!order) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 items-center justify-center gap-3 bg-background">
        <Text className="text-base font-semibold text-foreground">Order not available</Text>
        <Text className="px-10 text-center text-sm text-muted">
          It may have been reassigned or completed.
        </Text>
        <Button title="Back to orders" variant="outline" onPress={onBack} />
      </SafeAreaView>
    );
  }

  const step = nextStep(order.activity_status);
  const stage = incidentStageFor(order.activity_status);
  const headingToPickup = stage === 'pickup';
  const podRequired = Boolean(order.proof_of_delivery?.signature || order.proof_of_delivery?.picture);

  async function advance() {
    if (!step || !order) return;
    setAdvancing(true);
    try {
      const result = await updateActivityStatus(order.id, step.status);
      patchOrder(order.id, {
        activity_status: result.activity_status,
        status: result.status,
      });
      show(`Updated to “${step.label}”.`, { variant: 'success' });

      if (result.activity_status === 'delivery_initiated') {
        sendRecipientNotification(order.id).catch(() => {
          show('Unable to notify the recipient by email.', { variant: 'error' });
        });
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : 'Could not update the job.', {
        variant: 'error',
      });
    } finally {
      // Close the gate modals on failure too — the toast renders under a native
      // Modal, so leaving one open would swallow the error message.
      setQrOpen(false);
      setPodOpen(false);
      setAdvancing(false);
    }
  }

  /**
   * Two steps are gated behind proof, same as dispatcher-web: marking picked up
   * requires scanning the parcel's QR code, and marking delivered requires the
   * POD capture flow. Everything else advances directly.
   */
  function onPrimaryAction() {
    if (!step) return;
    if (step.status === 'picked_up') {
      setQrOpen(true);
    } else if (step.status === 'delivered') {
      setPodOpen(true);
    } else {
      advance();
    }
  }

  async function submitReport(reason: IncidentReason, description: string | null) {
    if (!order) return;
    setReporting(true);
    try {
      const { incident_report } = await reportIncident(order.id, stage, reason, description);
      patchOrder(order.id, { incident_report });
      setReportOpen(false);
      show('Issue reported. Dispatch has been notified.', { variant: 'success' });
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : 'Could not send the report.', {
        variant: 'error',
      });
    } finally {
      setReporting(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background pb-10">
      <View className="flex-row items-center  px-3 py-3">
        <TouchableOpacity
          onPress={onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-9 w-9 items-center justify-center "
        >
          <Ionicons name="chevron-back" size={20} color={palette.foreground} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-foreground">
          {order.order_number ?? '—'}
        </Text>
      </View>

      <ScrollView contentContainerClassName="gap-6 px-5 pb-10" showsVerticalScrollIndicator={false}>
        <Card>
          <CardBody className="gap-3">
            <SectionLabel>Navigate</SectionLabel>
            <NavigateRow
              title="Navigate to Pickup"
              address={order.pickup_address}
              active={headingToPickup}
              onPress={() =>
                openDirections(order.pickup_address, order.pickup_latitude, order.pickup_longitude)
              }
            />
            <NavigateRow
              title="Navigate to Drop"
              address={order.delivery_address}
              active={!headingToPickup}
              onPress={() =>
                openDirections(
                  order.delivery_address,
                  order.delivery_latitude,
                  order.delivery_longitude,
                )
              }
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="gap-5">
            <Party
              role="Sender"
              name={order.pickup_name}
              address={order.pickup_address}
              phone={order.pickup_phone}
            />
            <View className="h-px bg-border" />
            <Party
              role="Recipient"
              name={order.delivery_name}
              address={order.delivery_address}
              phone={order.delivery_phone}
            />
            <View className="h-px bg-border" />
            <View>
              <SectionLabel>Order breakdown</SectionLabel>
              {order.items.length === 0 ? (
                <Text className="text-[15px] text-muted">No items listed.</Text>
              ) : (
                <View className="gap-1.5">
                  {order.items.map((item, index) => (
                    <Text key={`${item.itemName}-${index}`} className="text-[15px] text-foreground">
                      {item.itemQty}x {item.itemName}
                    </Text>
                  ))}
                </View>
              )}
            </View>
            {order.instructions ? (
              <>
                <View className="h-px bg-border" />
                <View>
                  <SectionLabel>Instructions</SectionLabel>
                  <Text className="text-[15px] leading-5 text-foreground">
                    {order.instructions}
                  </Text>
                </View>
              </>
            ) : null}
          </CardBody>
        </Card>

        <View>
          <SectionLabel>Progress</SectionLabel>
          <ProgressTimeline status={order.activity_status} />
        </View>

        {order.incident_report && (
          <View
            className="rounded-xl px-4 py-3"
            style={{ backgroundColor: 'rgba(244, 63, 94, 0.12)' }}
          >
            <Text className="text-[13px] font-bold" style={{ color: DANGER }}>
              Issue reported · {order.incident_report.reason.replace(/_/g, ' ')}
            </Text>
            {order.incident_report.description ? (
              <Text className="mt-1 text-[13px] text-foreground">
                {order.incident_report.description}
              </Text>
            ) : null}
          </View>
        )}

        {podRequired && (
          <Text className="text-[13px] text-muted">
            This delivery requires proof of delivery
            {order.proof_of_delivery?.signature && order.proof_of_delivery?.picture
              ? ' (signature and photo).'
              : order.proof_of_delivery?.signature
                ? ' (signature).'
                : ' (photo).'}
          </Text>
        )}

        {step && (
          <Button title={step.action} loading={advancing} onPress={onPrimaryAction} />
        )}

        <View className="flex-row gap-3">
          <TouchableOpacity
              onPress={() => setContactOpen(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Contact"
              className="h-[50px] flex-1 flex-row items-center justify-center gap-2 rounded-xl btn-outline"
              style={{  }}
          >
            <Ionicons name="call" size={18} color={palette.primary} />
            <Text className="text-[15px] font-bold" style={{color:palette.primary}}>
              Contact
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setReportOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Report an issue"
            className="h-[50px] flex-1 flex-row items-center justify-center gap-2 rounded-xl border"
            style={{ borderColor: DANGER_BORDER }}
          >
            <Ionicons name="warning" size={18} color={DANGER} />
            <Text className="text-[15px] font-bold" style={{ color: DANGER }}>
              Report
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <QrScanSheet
        visible={qrOpen}
        orderNo={order.order_number}
        onClose={() => setQrOpen(false)}
        onMatched={advance}
      />

      <PodCaptureSheet
        visible={podOpen}
        signatureRequired={Boolean(order.proof_of_delivery?.signature)}
        submission={order.proof_of_delivery?.submission}
        completing={advancing}
        onClose={() => setPodOpen(false)}
        onCapturePhoto={() => openCapture(onCapturePhoto)}
        onCaptureSignature={() => openCapture(onCaptureSignature)}
        onDelivered={advance}
      />

      <ContactSheet order={contactOpen ? order : null} onClose={() => setContactOpen(false)} />

      <ReportSheet
        visible={reportOpen}
        stage={stage}
        submitting={reporting}
        onClose={() => setReportOpen(false)}
        onSubmit={submitReport}
      />
    </SafeAreaView>
  );
}
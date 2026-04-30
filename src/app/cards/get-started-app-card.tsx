import { Text, Link, EmptyState } from '@hubspot/ui-extensions';
import { hubspot } from '@hubspot/ui-extensions';

hubspot.extend<'crm.record.tab'>(() => <Extension />);

const Extension = () => {
  const appCardDocsLink =
    'https://developers.hubspot.com/docs/apps/developer-platform/add-features/ui-extensibility/app-cards/overview';

  return (
    <>
      <EmptyState
        title="Build your app card here!"
        layout="vertical"
        imageName="building"
      >
        <Text>
          Add a layer of UI customization to your app by including app cards
          that can display data, allow users to perform actions, and more. Visit
          the <Link href={appCardDocsLink}>app card documentation</Link> for
          more info, or check out the following links to get inspired:
        </Text>
      </EmptyState>
    </>
  );
};

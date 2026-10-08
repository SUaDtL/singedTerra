"""Run: python -m unittest discover -s Tools -p test_inspection_checks.py"""
import copy
import unittest
from inspection_checks import project, validate_geometry, camera_matches


def xyz(x, y, z):
    return dict(x=x, y=y, z=z)


def fixture():
    parts=[]
    for index,(key,target,label) in enumerate([
        ('cannon','BarrelRecoil','MAIN CANNON'),
        ('hull','Hull','ARMORED HULL'),
        ('fitting','Attachment_Repair','FIELD REPAIR UNIT')]):
        parts.append(dict(id=key,target=target,label=label,visible=True,
            anchorWorld=xyz(index,0,10),anchorScreen=xyz(800+45*index,450,10),
            endpointScreen=dict(x=800+45*index,y=450),
            panelMin=dict(x=20,y=20+index*100),panelMax=dict(x=272,y=84+index*100)))
    return dict(width=1600,height=900,cameraPosition=xyz(0,0,0),
                cameraForward=xyz(0,0,1),parts=parts)


class InspectionChecks(unittest.TestCase):
    def test_known_perspective(self):
        self.assertEqual(project((2,1,10),(0,0,0),(0,0,1),1600,900,90),(890,495))
    def test_valid_geometry(self):
        self.assertLess(validate_geometry(fixture(),True,'repair',90),1e-9)

    def test_corrupt_receipts_fail(self):
        changes=[('endpointScreen','x',20),('anchorScreen','x',20),
                 ('anchorWorld','x',2),('panelMin','x',-30),
                 ('panelMax','x',2000),('anchorWorld','y',float('nan'))]
        for field,axis,delta in changes:
            with self.subTest(field=field,axis=axis,delta=delta):
                data=fixture(); data['parts'][0][field][axis]+=delta
                with self.assertRaises(ValueError): validate_geometry(data,True,'repair',90)

    def test_binding_and_visibility_fail(self):
        for field,value in [('target','Hull'),('label','OTHER'),('visible',False)]:
            with self.subTest(field=field):
                data=fixture(); data['parts'][0][field]=value
                with self.assertRaises(ValueError): validate_geometry(data,True,'repair',90)
        with self.assertRaises(ValueError): validate_geometry(fixture(),True,'launcher',90)

    def test_missing_or_duplicate_parts_fail(self):
        data=fixture(); data['parts'].pop()
        with self.assertRaises(ValueError): validate_geometry(data,True,'repair',90)
        data=fixture(); data['parts'][1]=copy.deepcopy(data['parts'][0])
        with self.assertRaises(ValueError): validate_geometry(data,True,'repair',90)

    def test_hidden_geometry_does_not_need_a_drawn_endpoint(self):
        data=fixture()
        for part in data['parts']: part['visible']=False
        self.assertEqual(validate_geometry(data,False,'repair',90),0)
        data['parts'][0]['visible']=True
        with self.assertRaises(ValueError): validate_geometry(data,False,'repair',90)

    def test_invalid_projection_domain(self):
        for anchor,forward in [((0,0,-1),(0,0,1)),((0,0,1),(0,0,0)),((0,1,1),(0,1,0))]:
            with self.subTest(anchor=anchor,forward=forward):
                with self.assertRaises(ValueError): project(anchor,(0,0,0),forward,1600,900,90)

    def test_orbit_uses_actual_camera(self):
        base={'cameraPosition':xyz(0,6.7,13.5)}
        right={'cameraPosition':xyz(13.5,6.7,0)}
        self.assertTrue(camera_matches(right,base,90))
        self.assertFalse(camera_matches(base,base,90))
        self.assertTrue(camera_matches(base,base,360))


if __name__=='__main__': unittest.main()
